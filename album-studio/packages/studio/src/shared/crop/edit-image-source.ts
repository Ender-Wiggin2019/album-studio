import { applyBeautyToPixels, applyClarityToPixels, rotatedBoundingSize } from '@album-studio/common'
import { canvasToBlob, loadImageBitmap, scaleDown } from '../beauty/beautify-image-source'

/**
 * 照片编辑预览源管线：一次加载 → 旋转/翻转几何 → 美颜像素 → 新 blob URL。
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
 * @returns 处理后的 blob URL；canvas 不可用或处理失败时降级返回原 URL
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
    const bbox = rotateActive
      ? rotatedBoundingSize({ width: bitmap.width, height: bitmap.height }, params.rotationDeg)
      : { width: bitmap.width, height: bitmap.height }
    const scaled = scaleDown(bbox, maxEdge)
    // 旋转包围盒尺寸可能非整数，canvas 像素尺寸必须取整
    const width = Math.max(1, Math.round(scaled.width))
    const height = Math.max(1, Math.round(scaled.height))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return sourceUrl

    if (rotateActive) {
      // 与 computeCropStyle 相同的变换顺序：先翻转、后旋转，包围盒恰好铺满画布
      const scaleX = width / bbox.width
      const scaleY = height / bbox.height
      context.translate(width / 2, height / 2)
      context.rotate((params.rotationDeg * Math.PI) / 180)
      context.scale(params.flipX ? -1 : 1, params.flipY ? -1 : 1)
      context.drawImage(
        bitmap,
        -(bitmap.width * scaleX) / 2,
        -(bitmap.height * scaleY) / 2,
        bitmap.width * scaleX,
        bitmap.height * scaleY
      )
    } else {
      context.drawImage(bitmap, 0, 0, width, height)
    }

    if (beautyActive) {
      const imageData = context.getImageData(0, 0, width, height)
      const beautified = applyBeautyToPixels(imageData.data, width, height, params)
      const processed = applyClarityToPixels(beautified, width, height, params)
      imageData.data.set(processed)
      context.putImageData(imageData, 0, 0)
    }

    const blob = await canvasToBlob(canvas)
    if (!blob) return sourceUrl
    return URL.createObjectURL(blob)
  } catch {
    return sourceUrl
  } finally {
    bitmap?.close()
  }
}
