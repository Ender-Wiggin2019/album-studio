import {
  analyzeAutoEnhance,
  rotatedBoundingSize,
  type AutoEnhanceResult,
  type CropArea,
  type ImageCrop
} from '@album-studio/common'

/**
 * 自动美化分析管线：读取原图 → 缩小 → 按当前裁剪框截取分析区域 →
 * common 算法计算 brightness/contrast/saturation 参数。
 *
 * 失败（读取失败 / canvas 不可用 / 区域非法）返回 null，调用方保持原草稿；
 * 分析只读像素，不生成派生图片。桌面 album-asset: 与 Web blob: 均可被 fetch。
 */

const ANALYSIS_MAX_EDGE = 256

async function loadImageBitmap(sourceUrl: string): Promise<ImageBitmap> {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`无法读取图片：${response.status}`)
  const blob = await response.blob()
  return createImageBitmap(blob)
}

function scaleDown(
  size: Readonly<{ width: number; height: number }>,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(size.width, size.height)
  if (longest <= maxEdge) return { width: size.width, height: size.height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale))
  }
}

function isFullArea(area: CropArea): boolean {
  return area.x === 0 && area.y === 0 && area.width === 100 && area.height === 100
}

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * 分析照片并返回自动美化参数；失败返回 null。
 *
 * @param sourceUrl 原图 URL（桌面 album-asset: 或 Web blob:）
 * @param crop 当前框内几何与裁剪框；先应用旋转/翻转，再分析可见区域
 */
export async function autoEnhanceImageSource(
  sourceUrl: string,
  crop: ImageCrop
): Promise<AutoEnhanceResult | null> {
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await loadImageBitmap(sourceUrl)
    const boundingSize = rotatedBoundingSize(
      { width: bitmap.width, height: bitmap.height },
      crop.rotationDeg
    )
    const { width, height } = scaleDown(boundingSize, ANALYSIS_MAX_EDGE)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    const scaleX = width / boundingSize.width
    const scaleY = height / boundingSize.height
    context.translate(width / 2, height / 2)
    context.rotate((crop.rotationDeg * Math.PI) / 180)
    context.scale(crop.flipX ? -1 : 1, crop.flipY ? -1 : 1)
    context.drawImage(
      bitmap,
      -(bitmap.width * scaleX) / 2,
      -(bitmap.height * scaleY) / 2,
      bitmap.width * scaleX,
      bitmap.height * scaleY
    )

    let region = { x: 0, y: 0, width, height }
    if (!isFullArea(crop.area) && crop.area.width > 0 && crop.area.height > 0) {
      const x = clampInt(Math.round((crop.area.x / 100) * width), 0, width - 1)
      const y = clampInt(Math.round((crop.area.y / 100) * height), 0, height - 1)
      const regionWidth = clampInt(Math.round((crop.area.width / 100) * width), 1, width - x)
      const regionHeight = clampInt(Math.round((crop.area.height / 100) * height), 1, height - y)
      region = { x, y, width: regionWidth, height: regionHeight }
    }

    const imageData = context.getImageData(region.x, region.y, region.width, region.height)
    return analyzeAutoEnhance(imageData.data, region.width, region.height)
  } catch {
    return null
  } finally {
    bitmap?.close()
  }
}
