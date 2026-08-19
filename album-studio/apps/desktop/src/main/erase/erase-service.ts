import {
  EraseApplyRequestSchema,
  EraseApplyResultSchema,
  EraseDetectRequestSchema,
  EraseDetectResultSchema,
  eraseKeyFor,
  type EraseApplyResult,
  type EraseDetectResult
} from '@album-studio/common'
import sharp from 'sharp'
import { imageStore, type ImageStore } from '../assets/image-store'
import type { ProjectRepository } from '../projects/project-repository'
import { mergeEraseMask } from './erase-mask'
import { EraseInferenceService, maskToRgb } from './inference-service'

export class EraseService {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly images: ImageStore = imageStore,
    private readonly inference: EraseInferenceService = new EraseInferenceService()
  ) {}

  /** 自动识别照片中的人物，返回与原图同尺寸的二值遮罩（PNG Base64）。 */
  async detect(input: unknown): Promise<EraseDetectResult> {
    const request = EraseDetectRequestSchema.parse(input)
    const registration = this.projects.getRegisteredProjectByPath(request.projectPath)
    const asset = registration.document.assets.find((candidate) => candidate.id === request.assetId)
    if (!asset) throw new Error('要消除人物的照片不在当前项目中。')

    const original = await this.images.resolve(registration.root, asset, { variant: 'original' })
    const detected = await this.inference.detectPersons(original)
    const png = await sharp(maskToRgb(detected.mask, detected.width, detected.height), {
      raw: { width: detected.width, height: detected.height, channels: 3 }
    })
      .png({ compressionLevel: 9 })
      .toBuffer()
    return EraseDetectResultSchema.parse({
      maskBase64: png.toString('base64'),
      width: detected.width,
      height: detected.height
    })
  }

  /**
   * 应用消除：自动遮罩 ∪ 笔划 → LaMa 修补 → 写入派生缓存。
   * 结果与原图同像素尺寸，渲染链通过 quality=erased 取图。
   */
  async apply(input: unknown): Promise<EraseApplyResult> {
    const request = EraseApplyRequestSchema.parse(input)
    const registration = this.projects.getRegisteredProjectByPath(request.projectPath)
    const asset = registration.document.assets.find((candidate) => candidate.id === request.assetId)
    if (!asset) throw new Error('要消除人物的照片不在当前项目中。')

    const original = await this.images.resolve(registration.root, asset, { variant: 'original' })
    const eraseKey = eraseKeyFor(request.erase)

    const auto = request.erase.autoDetect ? await this.inference.detectPersons(original) : null
    const width = auto?.width ?? asset.width
    const height = auto?.height ?? asset.height
    const autoMask = auto?.mask ?? new Uint8Array(width * height)
    const finalMask = mergeEraseMask(
      autoMask,
      width,
      height,
      request.erase.autoDetect,
      request.erase.strokes
    )
    const result = await this.inference.inpaint(original, finalMask, width, height)
    await this.images.writeErased(registration.root, asset, eraseKey, result)
    return EraseApplyResultSchema.parse({ eraseKey, width, height })
  }
}
