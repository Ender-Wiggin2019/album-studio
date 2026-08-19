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

async function writePng(
  data: Buffer,
  width: number,
  height: number,
  channels: 3 | 4,
  path: string
): Promise<void> {
  await sharp(data, { raw: { width, height, channels } }).png().toFile(path)
}

describe.runIf(enabled)('EraseInferenceService real models (LaMa + composite)', () => {
  it('inpaints a manually masked region with a plausible fill', async () => {
    const root = await mkdtemp(join(tmpdir(), 'album-erase-integration-'))
    roots.push(root)
    const photo = join(root, 'photo.png')
    const width = 800
    const height = 600

    // 带噪声的灰蓝渐变背景（接近自然照片色调）+ 中央红色人形色块
    const rgba = Buffer.alloc(width * height * 4)
    const expectedAlpha = Buffer.alloc(width * height)
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
          rgba[i * 4] = 235
          rgba[i * 4 + 1] = 30
          rgba[i * 4 + 2] = 30
          mask[i] = 255
        } else {
          const n = noise()
          rgba[i * 4] = Math.max(0, Math.min(255, 90 + 60 * (y / height) + n))
          rgba[i * 4 + 1] = Math.max(0, Math.min(255, 100 + 70 * (y / height) + n))
          rgba[i * 4 + 2] = Math.max(0, Math.min(255, 120 + 80 * (y / height) + n))
        }
        const alpha = x < 60 ? 0 : x < 120 ? 96 : 255
        rgba[i * 4 + 3] = alpha
        expectedAlpha[i] = alpha
      }
    }
    await writePng(rgba, width, height, 4, photo)

    const service = new EraseInferenceService(modelDir)
    const result = await service.inpaint(photo, mask, width, height)
    const metadata = await sharp(result).metadata()
    expect(metadata.format).toBe('webp')
    expect(metadata.width).toBe(width)
    expect(metadata.height).toBe(height)

    // 填充区应与周围背景色调接近：均值 R 明显低于原色块 235，且不为黑
    const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(4)
    let redSum = 0
    let count = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x] > 127) {
          redSum += data[(y * width + x) * info.channels]
          count++
        }
      }
    }
    const meanRed = redSum / count
    console.log(`filled region mean red channel: ${meanRed.toFixed(1)} (blob was 235)`)
    expect(meanRed).toBeLessThan(190)
    expect(meanRed).toBeGreaterThan(30)
    const actualAlpha = Buffer.alloc(width * height)
    for (let i = 0; i < width * height; i++) actualAlpha[i] = data[i * info.channels + 3]
    expect(actualAlpha).toEqual(expectedAlpha)
  }, 120_000)
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
