import { applyBeautyToPixels, applyClarityToPixels, rotatedBoundingSize } from '@album-studio/common'
import { canvasToBlob, loadImageBitmap, scaleDown } from '../beauty/beautify-image-source'

/**
 * 照片编辑预览源管线：一次加载 → 美颜像素 → 旋转/翻转几何 → 新 blob URL。
 *
 * - 旋转/翻转与画布最终渲染链（computeCropStyle 的 rotate + scaleX/scaleY）保持
 *   相同的变换顺序（先翻转后旋转），保证编辑器里看到的裁剪框即最终显示。
 * - 美颜像素处理与 common 纯 JS 算法同一实现；处理前按 maxEdge 等比缩放。
 * - 全部参数为默认值（无旋转、无翻转、无美颜）时零开销透传原 URL。
 * - 失败时降级返回原 URL。调用方负责 revoke 返回的 blob URL。
 */

/** 编辑预览参数：美颜（磨皮/美白/清晰度）与框内几何（旋转/翻转）。 */
export type EditSourceParams = Readonly<{
  beautySmooth: number
  beautyWhiten: number
  clarity: number
  rotationDeg: number
  flipX: boolean
  flipY: boolean
}>

export function isEditSourceActive(params: EditSourceParams): boolean {
  return (
    params.beautySmooth > 0 ||
    params.beautyWhiten > 0 ||
    params.clarity > 0 ||
    params.rotationDeg !== 0 ||
    params.flipX ||
    params.flipY
  )
}

export function editSourceResultKey(source: string, params: EditSourceParams): string {
  return [
    source,
    params.beautySmooth,
    params.beautyWhiten,
    params.clarity,
    params.rotationDeg,
    params.flipX ? 1 : 0,
    params.flipY ? 1 : 0
  ].join('|')
}

/**
 * 对图片 URL 应用旋转/翻转与磨皮/美白/清晰度，返回处理后的 blob URL。
 *
 * @param sourceUrl 原图 URL（桌面 album-asset: 或 Web blob:，均可被 fetch）
 * @param params 编辑预览参数；全默认时直接返回原 URL
 * @param maxEdge 处理前的最长边上限；缺省 0 表示不缩放
 * @returns 处理后的 blob URL；参数关闭时返回原 URL，处理失败时抛出错误
 */
export async function editImageSource(
  sourceUrl: string,
  params: EditSourceParams,
  maxEdge: number | undefined = 0
): Promise<string> {
  if (!isEditSourceActive(params)) return sourceUrl

  const rotateActive = params.rotationDeg !== 0 || params.flipX || params.flipY
  const beautyActive =
    params.beautySmooth > 0 || params.beautyWhiten > 0 || params.clarity > 0

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await loadImageBitmap(sourceUrl)
    const originalSize = { width: bitmap.width, height: bitmap.height }
    const originalBounding = rotateActive
      ? rotatedBoundingSize(originalSize, params.rotationDeg)
      : originalSize
    const scaledBounding = scaleDown(originalBounding, maxEdge)
    const scale = Math.min(
      scaledBounding.width / originalBounding.width,
      scaledBounding.height / originalBounding.height
    )
    const baseSize = {
      width: Math.max(1, Math.round(bitmap.width * scale)),
      height: Math.max(1, Math.round(bitmap.height * scale))
    }

    let renderedSource: CanvasImageSource = bitmap
    let processedCanvas: HTMLCanvasElement | null = null
    let outputCanvas: HTMLCanvasElement

    if (beautyActive) {
      const beautyCanvas = document.createElement('canvas')
      beautyCanvas.width = baseSize.width
      beautyCanvas.height = baseSize.height
      const beautyContext = beautyCanvas.getContext('2d', { willReadFrequently: true })
      if (!beautyContext) throw new Error('Canvas 2D 不可用，无法处理照片。')
      beautyContext.drawImage(bitmap, 0, 0, baseSize.width, baseSize.height)
      const imageData = beautyContext.getImageData(0, 0, baseSize.width, baseSize.height)
      const beautified = applyBeautyToPixels(
        imageData.data,
        baseSize.width,
        baseSize.height,
        params
      )
      const processed = applyClarityToPixels(
        beautified,
        baseSize.width,
        baseSize.height,
        params
      )
      imageData.data.set(processed)
      beautyContext.putImageData(imageData, 0, 0)
      renderedSource = beautyCanvas
      processedCanvas = beautyCanvas
    }

    if (rotateActive) {
      const outputBounding = rotatedBoundingSize(baseSize, params.rotationDeg)
      const width = Math.max(1, Math.round(outputBounding.width))
      const height = Math.max(1, Math.round(outputBounding.height))
      outputCanvas = document.createElement('canvas')
      outputCanvas.width = width
      outputCanvas.height = height
      const outputContext = outputCanvas.getContext('2d')
      if (!outputContext) throw new Error('Canvas 2D 不可用，无法变换照片。')
      const scaleX = width / outputBounding.width
      const scaleY = height / outputBounding.height
      outputContext.translate(width / 2, height / 2)
      outputContext.rotate((params.rotationDeg * Math.PI) / 180)
      outputContext.scale(params.flipX ? -1 : 1, params.flipY ? -1 : 1)
      outputContext.drawImage(
        renderedSource,
        -(baseSize.width * scaleX) / 2,
        -(baseSize.height * scaleY) / 2,
        baseSize.width * scaleX,
        baseSize.height * scaleY
      )
    } else if (processedCanvas) {
      outputCanvas = processedCanvas
    } else {
      throw new Error('照片处理状态无效。')
    }

    const blob = await canvasToBlob(outputCanvas)
    if (!blob) throw new Error('无法生成处理后的照片。')
    return URL.createObjectURL(blob)
  } finally {
    bitmap?.close()
  }
}
