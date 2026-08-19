import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type * as Ort from 'onnxruntime-node'
import sharp from 'sharp'

const SEGMENT_INPUT = 256
const LAMA_INPUT = 512
// 图像缩小插值会在对象轮廓外留下颜色采样；1px 是 512 模型输入中能隔离该污染的最小边界。
const LAMA_MASK_MARGIN = 1

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
  private runtimePromise: Promise<typeof import('onnxruntime-node')> | null = null
  private segmentation: Promise<Ort.InferenceSession> | null = null
  private lama: Promise<Ort.InferenceSession> | null = null

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

  private runtime(): Promise<typeof import('onnxruntime-node')> {
    this.runtimePromise ??= import('onnxruntime-node').catch((error: unknown) => {
      throw new Error('当前安装包无法加载与系统架构匹配的 ONNX Runtime。请重新安装应用。', {
        cause: error
      })
    })
    return this.runtimePromise
  }

  private async segmentationSession(): Promise<Ort.InferenceSession> {
    const ort = await this.runtime()
    this.segmentation ??= ort.InferenceSession.create(this.modelPath('selfie_segmentation.onnx'))
    return this.segmentation
  }

  private async lamaSession(): Promise<Ort.InferenceSession> {
    const ort = await this.runtime()
    this.lama ??= ort.InferenceSession.create(this.modelPath('lama_512_int8.onnx'))
    return this.lama
  }

  /** 自动识别人物遮罩（与原图同尺寸的二值图）。 */
  async detectPersons(imagePath: string): Promise<PersonMask> {
    const metadata = await sharp(imagePath).metadata()
    const width = metadata.autoOrient.width ?? 0
    const height = metadata.autoOrient.height ?? 0
    if (width < 1 || height < 1) throw new Error('图片尺寸无效。')

    const data = await decodeSrgb(imagePath, SEGMENT_INPUT, SEGMENT_INPUT)

    const input = new Uint8Array(SEGMENT_INPUT * SEGMENT_INPUT * 3)
    for (let i = 0; i < SEGMENT_INPUT * SEGMENT_INPUT; i++) {
      input[i * 3] = data[i * 3]
      input[i * 3 + 1] = data[i * 3 + 1]
      input[i * 3 + 2] = data[i * 3 + 2]
    }
    const [ort, session] = await Promise.all([this.runtime(), this.segmentationSession()])
    const results = await session.run({
      pixel_values: new ort.Tensor('uint8', input, [1, SEGMENT_INPUT, SEGMENT_INPUT, 3])
    })
    const alphas = results.alphas as Ort.Tensor
    const smallMask = Buffer.alloc(SEGMENT_INPUT * SEGMENT_INPUT)
    for (let i = 0; i < SEGMENT_INPUT * SEGMENT_INPUT; i++) {
      smallMask[i] = (alphas.data as Float32Array)[i] > 0.5 ? 255 : 0
    }
    const resizedMask = await resizeBinaryMask(
      smallMask,
      SEGMENT_INPUT,
      SEGMENT_INPUT,
      width,
      height
    )
    return { mask: Uint8Array.from(resizedMask, (value) => value * 255), width, height }
  }

  /**
   * LaMa 修补：模型输入遮罩增加一个像素的安全边界；
   * 最终仅在原始遮罩内使用模型输出，遮罩外保留原图。
   * 返回与原图同尺寸、已按 EXIF 方向摆正的 WebP。
   */
  async inpaint(
    imagePath: string,
    mask: Uint8Array,
    width: number,
    height: number
  ): Promise<Buffer> {
    const [ort, session] = await Promise.all([this.runtime(), this.lamaSession()])
    // 原尺寸像素：模型只读 RGB，最终结果保留原图 alpha。
    const fullRgba = await decodeSrgba(imagePath, width, height)
    const fullRgb = rgbaToRgb(fullRgba, width, height)

    // 等比缩放使最长边 <= 512，边缘复制补边到 512×512
    const scale = Math.min(LAMA_INPUT / width, LAMA_INPUT / height)
    const fitWidth = Math.max(1, Math.round(width * scale))
    const fitHeight = Math.max(1, Math.round(height * scale))
    // LaMa 不只需要遮住人物内部；缩小后边缘的轮廓/颜色仍会让模型继续生成原对象。
    // 固定为 512 模型空间的少量像素，避免边界随原图分辨率变化。
    const maskMargin = Math.max(1, Math.ceil(LAMA_MASK_MARGIN / scale))
    const expandedModelMask = await expandBinaryMask(mask, width, height, maskMargin)
    const maskResized = await resizeBinaryMask(
      expandedModelMask,
      width,
      height,
      fitWidth,
      fitHeight
    )
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
        const maskBit = maskResized[src]
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
    const output = (results.output as Ort.Tensor).data as Float32Array

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

    const composited = compositeErase(fullRgba, modelFull, mask, width, height)
    return sharp(composited, { raw: { width, height, channels: 4 } })
      .webp({ quality: 92, alphaQuality: 100, effort: 4 })
      .toBuffer()
  }
}

/**
 * 合成修补结果：遮罩内部完整使用模型 RGB，遮罩外保留原图 RGB，
 * 遮罩内外始终保留原图 alpha。
 * 不做按整图尺寸放大的羽化或全局均值校色：它们会让小遮罩
 * 仅混入少量修补结果，或在多色背景上主动改变模型的正确颜色。
 */
export function compositeErase(
  originalRgba: Uint8Array,
  modelRgb: Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number
): Buffer {
  const pixels = width * height
  const composited = Buffer.alloc(pixels * 4)
  for (let i = 0; i < pixels; i++) {
    const originalOffset = i * 4
    const modelOffset = i * 3
    const outputOffset = i * 4
    const useModel = mask[i] >= 128
    for (let channel = 0; channel < 3; channel++) {
      composited[outputOffset + channel] = useModel
        ? modelRgb[modelOffset + channel]
        : originalRgba[originalOffset + channel]
    }
    composited[outputOffset + 3] = originalRgba[originalOffset + 3]
  }
  return composited
}

/** 模型输入的唯一解码入口：摆正方向、转 sRGB，再明确去除 alpha 得到 RGB。 */
export async function decodeSrgb(
  input: string | Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const rgba = await decodeSrgba(input, width, height)
  return rgbaToRgb(rgba, width, height)
}

/** 最终合成的解码入口：摆正方向、转 sRGB，并始终输出 RGBA。 */
export async function decodeSrgba(
  input: string | Buffer,
  width: number,
  height: number
): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .autoOrient()
    .toColourspace('srgb')
    .ensureAlpha()
    .resize(width, height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (info.channels !== 4) throw new Error('图片无法转换为 sRGB RGBA 像素。')
  return data
}

function rgbaToRgb(rgba: Uint8Array, width: number, height: number): Buffer {
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = rgba[i * 4]
    rgb[i * 3 + 1] = rgba[i * 4 + 1]
    rgb[i * 3 + 2] = rgba[i * 4 + 2]
  }
  return rgb
}

export async function resizeBinaryMask(
  mask: Uint8Array,
  width: number,
  height: number,
  fitWidth: number,
  fitHeight: number
): Promise<Uint8Array> {
  const { data } = await sharp(maskToRgb(mask, width, height), {
    raw: { width, height, channels: 3 }
  })
    .resize(fitWidth, fitHeight, { fit: 'fill', kernel: sharp.kernel.nearest })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true })
  return Uint8Array.from(data, (value) => (value >= 128 ? 1 : 0))
}

/**
 * 为模型输入遮罩增加小幅安全边界，让模型看不到待消除对象的轮廓。
 * Sharp 的 erode 对白色前景扩张；最终再二值化，不引入羽化或半透明混合。
 */
export async function expandBinaryMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): Promise<Uint8Array> {
  if (radius < 1) return Uint8Array.from(mask, (value) => (value >= 128 ? 255 : 0))
  const { data } = await sharp(maskToRgb(mask, width, height), {
    raw: { width, height, channels: 3 }
  })
    .erode(radius)
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true })
  return Uint8Array.from(data, (value) => (value >= 128 ? 255 : 0))
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
