// @vitest-environment node
// Opt-in 真实推理集成测试：需要本机存在模型文件（apps/desktop/resources/models）。
// 运行：ERASE_INTEGRATION=1 npx vitest run src/main/erase/inference-service.integration.test.ts
// 人物自动识别用例额外需要真实照片：ERASE_INTEGRATION_PHOTO=<路径>
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { EraseInferenceService } from './inference-service'

sharp.cache(false)

const enabled = process.env.ERASE_INTEGRATION === '1'
const realPhoto = process.env.ERASE_INTEGRATION_PHOTO
// vitest 的 cwd 是 apps/desktop
const modelDir = resolve(process.cwd(), 'resources/models')
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function writePng(data: Buffer, width: number, height: number, path: string): Promise<void> {
  await sharp(data, { raw: { width, height, channels: 3 } })
    .png()
    .toFile(path)
}

describe.runIf(enabled)('EraseInferenceService real models (LaMa + composite)', () => {
  it(
    'inpaints a manually masked region with a plausible fill',
    async () => {
    const root = await mkdtemp(join(tmpdir(), 'album-erase-integration-'))
    roots.push(root)
    const photo = join(root, 'photo.png')
    const width = 800
    const height = 600

    // 带噪声的灰蓝渐变背景（接近自然照片色调）+ 中央红色人形色块
    const rgb = Buffer.alloc(width * height * 3)
    const mask = new Uint8Array(width * height)
    let seed = 7
    const noise = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return (seed / 0x7fffffff - 0.5) * 50
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const inBody =
          ((x - width * 0.5) / (width * 0.07)) ** 2 +
            ((y - height * 0.45) / (height * 0.28)) ** 2 <=
          1
        if (inBody) {
          rgb[i * 3] = 235
          rgb[i * 3 + 1] = 30
          rgb[i * 3 + 2] = 30
          mask[i] = 255
        } else {
          const n = noise()
          rgb[i * 3] = Math.max(0, Math.min(255, 90 + 60 * (y / height) + n))
          rgb[i * 3 + 1] = Math.max(0, Math.min(255, 100 + 70 * (y / height) + n))
          rgb[i * 3 + 2] = Math.max(0, Math.min(255, 120 + 80 * (y / height) + n))
        }
      }
    }
    await writePng(rgb, width, height, photo)

    const service = new EraseInferenceService(modelDir)
    const result = await service.inpaint(photo, mask, width, height)
    const metadata = await sharp(result).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(width)
    expect(metadata.height).toBe(height)

    // 填充区应与周围背景色调接近：均值 R 明显低于原色块 235，且不为黑
    const { data } = await sharp(result).raw().toBuffer({ resolveWithObject: true })
    let redSum = 0
    let count = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x] > 127) {
          redSum += data[(y * width + x) * 3]
          count++
        }
      }
    }
    const meanRed = redSum / count
    console.log(`filled region mean red channel: ${meanRed.toFixed(1)} (blob was 235)`)
    expect(meanRed).toBeLessThan(190)
    expect(meanRed).toBeGreaterThan(30)
    },
    120_000
  )
})

describe.runIf(enabled && Boolean(realPhoto))(
  'EraseInferenceService real models (person detection)',
  () => {
    it('detects a person mask on a real photo', async () => {
      const service = new EraseInferenceService(modelDir)
      const detected = await service.detectPersons(realPhoto!)
      const coverage =
        detected.mask.reduce((sum, value) => sum + (value > 127 ? 1 : 0), 0) /
        (detected.width * detected.height)
      console.log(
        `auto mask coverage on ${realPhoto}: ${(coverage * 100).toFixed(1)}% (${detected.width}x${detected.height})`
      )
      expect(detected.width).toBeGreaterThan(100)
      expect(detected.height).toBeGreaterThan(100)
      expect(coverage).toBeGreaterThan(0.005) // 真实照片至少命中一部分人物区域
    })
  }
)
