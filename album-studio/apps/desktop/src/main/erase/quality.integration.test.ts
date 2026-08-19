// @vitest-environment node
// 质量回归（真实模型，opt-in）：大尺寸带纹理合成图的修补指标 ——
// 填充区纹理（σ）、填充区与周围环带的色差、与原图保真度（PSNR）。
// 运行：ERASE_INTEGRATION=1 npx vitest run src/main/erase/quality.integration.test.ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { EraseInferenceService } from './inference-service'

sharp.cache(false)

const enabled = process.env.ERASE_INTEGRATION === '1'
const modelDir = resolve(process.cwd(), 'resources/models')
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

/** 带渐变 + 噪声纹理的背景，中央红色人形色块；返回照片/真背景/遮罩的 RGB 与 Buffer。 */
function buildScene(width: number, height: number): {
  photo: Buffer
  trueBg: Buffer
  mask: Uint8Array
} {
  const photo = Buffer.alloc(width * height * 3)
  const trueBg = Buffer.alloc(width * height * 3)
  const mask = new Uint8Array(width * height)
  let seed = 20260818
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const cx = width * 0.5
  const cy = height * 0.48
  const rxA = width * 0.085
  const ryA = height * 0.3
  const rxB = width * 0.055
  const ryB = height * 0.11
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const n = (rand() - 0.5) * 30
      const g = 100 + 120 * (y / height) + n
      const r = Math.max(0, Math.min(255, 40 + g * 0.25))
      const gv = Math.max(0, Math.min(255, 80 + g * 0.6))
      const b = Math.max(0, Math.min(255, 150 + g * 0.85))
      trueBg[i * 3] = r
      trueBg[i * 3 + 1] = gv
      trueBg[i * 3 + 2] = b
      const inBody = ((x - cx) / rxA) ** 2 + ((y - cy) / ryA) ** 2 <= 1
      const headCy = cy - ryA - ryB * 0.55
      const inHead = ((x - cx) / rxB) ** 2 + ((y - headCy) / ryB) ** 2 <= 1
      if (inBody || inHead) {
        const j = (rand() - 0.5) * 40
        photo[i * 3] = Math.max(0, Math.min(255, 235 + j))
        photo[i * 3 + 1] = Math.max(0, Math.min(255, 30 + j))
        photo[i * 3 + 2] = Math.max(0, Math.min(255, 30 + j))
        mask[i] = 255
      } else {
        photo[i * 3] = r
        photo[i * 3 + 1] = gv
        photo[i * 3 + 2] = b
      }
    }
  }
  return { photo, trueBg, mask }
}

async function writePng(
  data: Buffer,
  width: number,
  height: number,
  channels: 1 | 2 | 3 | 4,
  path: string
): Promise<void> {
  await sharp(data, { raw: { width, height, channels } }).png().toFile(path)
}

/** 遮罩外扩 ring 像素与遮罩收缩 core 像素（sharp 的 erode 扩张白色、dilate 收缩白色，实测验证）。 */
async function ringSelection(
  mask: Uint8Array,
  width: number,
  height: number,
  iterations: number
): Promise<{ ring: Uint8Array; core: Uint8Array }> {
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    const v = mask[i]
    rgb[i * 3] = v
    rgb[i * 3 + 1] = v
    rgb[i * 3 + 2] = v
  }
  const expanded = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .erode(iterations)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const shrunk = await sharp(rgb, { raw: { width, height, channels: 3 } })
    .dilate(iterations * 2)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ring = new Uint8Array(width * height)
  const core = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    if (shrunk.data[i] > 127) core[i] = 1
    else if (mask[i] > 127) continue
    else if (expanded.data[i] > 127) ring[i] = 1
  }
  return { ring, core }
}

function stats(
  sel: Uint8Array,
  data: Buffer,
  width: number,
  height: number,
  channels: number
): { mean: number[]; std: number[]; n: number } {
  const mean = [0, 0, 0]
  const sq = [0, 0, 0]
  let n = 0
  for (let i = 0; i < width * height; i++) {
    if (!sel[i]) continue
    for (let c = 0; c < 3; c++) {
      const v = data[i * channels + c]
      mean[c] += v
      sq[c] += v * v
    }
    n++
  }
  if (n === 0) return { mean: [NaN, NaN, NaN], std: [NaN, NaN, NaN], n: 0 }
  return {
    mean: mean.map((s) => s / n),
    std: sq.map((s, c) => Math.sqrt(s / n - (mean[c] / n) ** 2)),
    n
  }
}

function psnr(
  sel: Uint8Array,
  a: Buffer,
  b: Buffer,
  width: number,
  height: number,
  channels: number
): { psnr: number; maxDiff: number; n: number } {
  let mse = 0
  let maxDiff = 0
  let n = 0
  for (let i = 0; i < width * height; i++) {
    if (!sel[i]) continue
    for (let c = 0; c < 3; c++) {
      const d = a[i * channels + c] - b[i * channels + c]
      mse += d * d
      maxDiff = Math.max(maxDiff, Math.abs(d))
    }
    n++
  }
  if (n === 0) return { psnr: NaN, maxDiff: 0, n: 0 }
  mse /= n * 3
  return { psnr: mse === 0 ? Infinity : 10 * Math.log10(255 * 255 / mse), maxDiff, n }
}

describe.runIf(enabled)('EraseInferenceService quality regression (real models)', () => {
  it(
    'large textured photo: fill keeps texture, matches ring color, original untouched',
    async () => {
    const root = await mkdtemp(join(tmpdir(), 'album-erase-quality-'))
    roots.push(root)
    const width = 3200
    const height = 2400
    const scene = buildScene(width, height)
    const photoPath = join(root, 'photo.png')
    const trueBgPath = join(root, 'true.png')
    await writePng(scene.photo, width, height, 3, photoPath)
    await writePng(scene.trueBg, width, height, 3, trueBgPath)

    const service = new EraseInferenceService(modelDir)
    const result = await service.inpaint(photoPath, scene.mask, width, height)
    const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true })
    expect(info.width).toBe(width)
    expect(info.height).toBe(height)

    const { ring, core } = await ringSelection(scene.mask, width, height, 20)
    const fill = stats(core, data, width, height, info.channels)
    const ringStats = stats(ring, data, width, height, info.channels)
    const ringTrue = stats(ring, scene.trueBg, width, height, 3)
    const fidelity = psnr(core, data, scene.trueBg, width, height, info.channels)
    // 遮罩外环带与原图的差异（仅诊断：webp 去块滤波在遮罩边界附近会有少量影响，
    // “遮罩外 1:1 保留”的字节级契约由 composite-erase.test.ts 守护）
    const ringUntouched = psnr(ring, data, scene.photo, width, height, info.channels)

    const fillRingStdRatio = Math.min(
      fill.std[0] / ringStats.std[0],
      fill.std[1] / ringStats.std[1],
      fill.std[2] / ringStats.std[2]
    )
    const colorDiff = Math.max(
      Math.abs(fill.mean[0] - ringTrue.mean[0]),
      Math.abs(fill.mean[1] - ringTrue.mean[1]),
      Math.abs(fill.mean[2] - ringTrue.mean[2])
    )
    console.log(`[quality] fill mean=[${fill.mean.map((v) => v.toFixed(1)).join(',')}] std=[${fill.std.map((v) => v.toFixed(1)).join(',')}]`)
    console.log(`[quality] ring mean=[${ringTrue.mean.map((v) => v.toFixed(1)).join(',')}] std=[${ringStats.std.map((v) => v.toFixed(1)).join(',')}]`)
    console.log(
      `[quality] fill/ring std ratio(min ch)=${fillRingStdRatio.toFixed(2)}  colorDiff=${colorDiff.toFixed(1)}/255  masked PSNR=${fidelity.psnr.toFixed(1)}dB  ring-untouched PSNR=${ringUntouched.psnr.toFixed(1)}dB`
    )

    // 填充色差不可见（<15/255 与周边均值差）
    expect(colorDiff).toBeLessThan(15)
    // 填充区保留与周边相当的纹理（锐化 + 颗粒后不再“发虚”）
    expect(fillRingStdRatio).toBeGreaterThan(0.5)
    // 合成图整体可用
    expect(fidelity.psnr).toBeGreaterThan(10)
    },
    120_000
  )
})
