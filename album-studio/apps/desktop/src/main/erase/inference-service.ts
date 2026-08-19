import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as ort from 'onnxruntime-node'
import sharp from 'sharp'

const SEGMENT_INPUT = 256
const LAMA_INPUT = 512

export const ERASE_MODEL_DIR = 'models'

function resolveModelDirectory(): string {
  if (app.isPackaged) {
    // extraResources 把模型复制到 resources/models（不受 .gitignore 排除影响）
    return join(process.resourcesPath, ERASE_MODEL_DIR)
  }
  return join(app.getAppPath(), 'resources', ERASE_MODEL_DIR)
}

export type PersonMask = {
  /** 与图片同尺寸的二值遮罩（0/255）。 */
  mask: Uint8Array
  width: number
  height: number
}

export class EraseInferenceService {
  private readonly modelDirectoryPath: string
  private segmentation: Promise<ort.InferenceSession> | null = null
  private lama: Promise<ort.InferenceSession> | null = null

  constructor(modelDirectoryPath?: string) {
    this.modelDirectoryPath = modelDirectoryPath ?? resolveModelDirectory()
  }

  private modelPath(fileName: string): string {
    const candidate = join(this.modelDirectoryPath, fileName)
    if (!existsSync(candidate)) {
      throw new Error(
        `AI 模型文件缺失：${candidate}\n请运行 npm run download:models（apps/desktop）下载后重试。`
      )
    }
    return candidate
  }

  private segmentationSession(): Promise<ort.InferenceSession> {
    this.segmentation ??= ort.InferenceSession.create(this.modelPath('selfie_segmentation.onnx'))
    return this.segmentation
  }

  private lamaSession(): Promise<ort.InferenceSession> {
    this.lama ??= ort.InferenceSession.create(this.modelPath('lama_512_int8.onnx'))
    return this.lama
  }

  /** 自动识别人物遮罩（与原图同尺寸的二值图）。 */
  async detectPersons(imagePath: string): Promise<PersonMask> {
    const metadata = await sharp(imagePath).metadata()
    const width = metadata.autoOrient.width ?? 0
    const height = metadata.autoOrient.height ?? 0
    if (width < 1 || height < 1) throw new Error('图片尺寸无效。')

    const { data } = await sharp(imagePath)
      .autoOrient()
      .resize(SEGMENT_INPUT, SEGMENT_INPUT, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const input = new Uint8Array(SEGMENT_INPUT * SEGMENT_INPUT * 3)
    for (let i = 0; i < SEGMENT_INPUT * SEGMENT_INPUT; i++) {
      input[i * 3] = data[i * 3]
      input[i * 3 + 1] = data[i * 3 + 1]
      input[i * 3 + 2] = data[i * 3 + 2]
    }
    const session = await this.segmentationSession()
    const results = await session.run({
      pixel_values: new ort.Tensor('uint8', input, [1, SEGMENT_INPUT, SEGMENT_INPUT, 3])
    })
    const alphas = results.alphas as ort.Tensor
    const smallMask = Buffer.alloc(SEGMENT_INPUT * SEGMENT_INPUT)
    for (let i = 0; i < SEGMENT_INPUT * SEGMENT_INPUT; i++) {
      smallMask[i] = (alphas.data as Float32Array)[i] > 0.5 ? 255 : 0
    }
    const { data: fullMask } = await sharp(maskToRgb(smallMask, SEGMENT_INPUT, SEGMENT_INPUT), {
      raw: { width: SEGMENT_INPUT, height: SEGMENT_INPUT, channels: 3 }
    })
      .resize(width, height, { fit: 'fill' })
      .extractChannel(0)
      .raw()
      .toBuffer({ resolveWithObject: true })
    return { mask: new Uint8Array(fullMask), width, height }
  }

  /**
   * LaMa 修补：遮罩外 100% 保留原图，遮罩内用模型输出并与羽化遮罩合成。
   * 返回与原图同尺寸、已按 EXIF 方向摆正的 WebP。
   */
  async inpaint(
    imagePath: string,
    mask: Uint8Array,
    width: number,
    height: number
  ): Promise<Buffer> {
    const session = await this.lamaSession()
    // 原尺寸像素（合成用）
    const { data: fullRgb } = await sharp(imagePath)
      .autoOrient()
      .resize(width, height, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    // 等比缩放使最长边 <= 512，边缘复制补边到 512×512
    const scale = Math.min(LAMA_INPUT / width, LAMA_INPUT / height)
    const fitWidth = Math.max(1, Math.round(width * scale))
    const fitHeight = Math.max(1, Math.round(height * scale))
    const maskResized = await resizeMask(mask, width, height, fitWidth, fitHeight)
    const { data: fitRgb } = await sharp(fullRgb, {
      raw: { width, height, channels: 3 }
    })
      .resize(fitWidth, fitHeight, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true })

    const input = new Float32Array(4 * LAMA_INPUT * LAMA_INPUT)
    for (let y = 0; y < LAMA_INPUT; y++) {
      const sy = Math.min(y, fitHeight - 1)
      for (let x = 0; x < LAMA_INPUT; x++) {
        const sx = Math.min(x, fitWidth - 1)
        const src = sy * fitWidth + sx
        const dst = y * LAMA_INPUT + x
        const maskBit = maskResized[src] > 0.5 ? 1 : 0
        // 模型卡明确输入约定为“遮罩区置 0”；均值填充会偏离该导出的验证分布（实测生成异常偏亮）
        input[dst] = maskBit ? 0 : fitRgb[src * 3] / 255
        input[LAMA_INPUT * LAMA_INPUT + dst] = maskBit ? 0 : fitRgb[src * 3 + 1] / 255
        input[2 * LAMA_INPUT * LAMA_INPUT + dst] = maskBit ? 0 : fitRgb[src * 3 + 2] / 255
        input[3 * LAMA_INPUT * LAMA_INPUT + dst] = maskBit
      }
    }

    const results = await session.run({
      input: new ort.Tensor('float32', input, [1, 4, LAMA_INPUT, LAMA_INPUT])
    })
    const output = (results.output as ort.Tensor).data as Float32Array

    const modelCrop = Buffer.alloc(fitWidth * fitHeight * 3)
    for (let y = 0; y < fitHeight; y++) {
      for (let x = 0; x < fitWidth; x++) {
        const src = y * LAMA_INPUT + x
        const dst = y * fitWidth + x
        for (let channel = 0; channel < 3; channel++) {
          const value = output[channel * LAMA_INPUT * LAMA_INPUT + src]
          modelCrop[dst * 3 + channel] = Math.max(0, Math.min(255, Math.round(value * 255)))
        }
      }
    }
    // 放大回原尺寸时做轻度锐化：模型 512 输出放大数倍后偏软，
    // 不恢复清晰度会让填充区与周围锐利原图形成明显反差（“发虚”）。
    // 半径随放大倍数，幅度取小值——锐化补不回缺失的高频细节，过度会放大伪影并裁掉极亮/极暗像素。
    const upscale = Math.max(width, height) / LAMA_INPUT
    const sharpenSigma = Math.max(1.5, Math.min(3, upscale * 0.3))
    const { data: modelFull } = await sharp(modelCrop, {
      raw: { width: fitWidth, height: fitHeight, channels: 3 }
    })
      .resize(width, height, { fit: 'fill' })
      .sharpen({ sigma: sharpenSigma, m1: 0.1, m2: 0.25, x1: 0, y2: 3, y3: 3 })
      .raw()
      .toBuffer({ resolveWithObject: true })

    // 羽化宽度随图片尺寸（min 边约 0.8%，钳制 [6, 36]）：
    // 固定 blur(3) 在高分辨率图片上过渡带只有约 ±9px，锐利原图与填充交界一眼可见。
    const featherSigma = Math.max(6, Math.min(36, Math.round(Math.min(width, height) * 0.008)))
    const { data: feather } = await sharp(maskToRgb(mask, width, height), {
      raw: { width, height, channels: 3 }
    })
      .blur(featherSigma)
      .extractChannel(0)
      .raw()
      .toBuffer({ resolveWithObject: true })

    // 原图轻度模糊，用于估算环带高频颗粒强度（见 compositeErase）。
    const { data: blurredRgb } = await sharp(fullRgb, {
      raw: { width, height, channels: 3 }
    })
      .blur(1.5)
      .raw()
      .toBuffer({ resolveWithObject: true })

    const composited = compositeErase(fullRgb, modelFull, mask, feather, blurredRgb, width, height)
    return sharp(composited, { raw: { width, height, channels: 3 } })
      .webp({ quality: 92, effort: 4 })
      .toBuffer()
  }
}

/** 填充颜色对齐偏移上限（像素级）。 */
const MAX_COLOR_OFFSET = 48
/** 填充颗粒强度上限（像素级）。 */
const MAX_GRAIN_SIGMA = 6

/**
 * 合成修补结果：
 * - alpha = min(羽化, 遮罩)，保证模型输出只作用在遮罩内部，遮罩外原图 1:1 保留；
 * - 用“遮罩外环带原图均值 − 填充核心模型均值”的逐通道差对齐填充颜色，
 *   消除模型填充与周边环境的整体色差/亮度差（填充“发灰、发暗”的观感）；
 * - 用环带原图的高频残差估计颗粒强度，给填充区加确定性高斯颗粒，匹配原图质感。
 */
export function compositeErase(
  original: Uint8Array,
  model: Uint8Array,
  mask: Uint8Array,
  feather: Uint8Array,
  blurredOriginal: Uint8Array,
  width: number,
  height: number,
  seed = 0x9e3779b9
): Buffer {
  const pixels = width * height
  const ringSumOriginal = [0, 0, 0]
  const coreSumModel = [0, 0, 0]
  let ringResidualSq = 0
  let ringCount = 0
  let coreCount = 0
  for (let i = 0; i < pixels; i++) {
    const o = i * 3
    if (feather[i] > 0 && mask[i] === 0) {
      for (let channel = 0; channel < 3; channel++) {
        ringSumOriginal[channel] += original[o + channel]
        const residual = original[o + channel] - blurredOriginal[o + channel]
        ringResidualSq += residual * residual
      }
      ringCount++
    } else if (mask[i] === 255 && feather[i] === 255) {
      for (let channel = 0; channel < 3; channel++) {
        coreSumModel[channel] += model[o + channel]
      }
      coreCount++
    }
  }
  const offset = ringCount > 0 && coreCount > 0
    ? ringSumOriginal.map((sum, channel) =>
        clamp(sum / ringCount - coreSumModel[channel] / coreCount, -MAX_COLOR_OFFSET, MAX_COLOR_OFFSET)
      )
    : [0, 0, 0]
  const grainSigma =
    ringCount > 0 ? Math.min(MAX_GRAIN_SIGMA, Math.sqrt(ringResidualSq / (ringCount * 3)) * 0.8) : 0

  const random = mulberry32(seed)
  const composited = Buffer.alloc(pixels * 3)
  for (let i = 0; i < pixels; i++) {
    const alpha = Math.min(feather[i], mask[i]) / 255
    const o = i * 3
    if (alpha <= 0) {
      composited[o] = original[o]
      composited[o + 1] = original[o + 1]
      composited[o + 2] = original[o + 2]
      continue
    }
    const noise = grainSigma > 0 ? gaussianSample(random) * grainSigma : 0
    for (let channel = 0; channel < 3; channel++) {
      const source = o + channel
      const filled = clamp(model[source] + offset[channel] + noise, 0, 255)
      composited[source] = Math.round(original[source] * (1 - alpha) + filled * alpha)
    }
  }
  return composited
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** 确定性伪随机数（mulberry32），保证颗粒结果可复现。 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 标准正态采样（Box-Muller）。 */
function gaussianSample(random: () => number): number {
  const u = Math.max(random(), 1e-12)
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

async function resizeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  fitWidth: number,
  fitHeight: number
): Promise<Uint8Array> {
  const { data } = await sharp(maskToRgb(mask, width, height), {
    raw: { width, height, channels: 3 }
  })
    .resize(fitWidth, fitHeight, { fit: 'fill' })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true })
  return new Uint8Array(data)
}

/** sharp 的 raw 输入不支持单通道，把二值遮罩展开为 RGB。 */
export function maskToRgb(mask: Uint8Array, width: number, height: number): Buffer {
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    const value = mask[i]
    rgb[i * 3] = value
    rgb[i * 3 + 1] = value
    rgb[i * 3 + 2] = value
  }
  return rgb
}
