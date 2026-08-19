import { applyBeautyToPixels, applyClarityToPixels } from '@album-studio/common'

/**
 * 照片像素增强管线：加载图片 → canvas 逐像素磨皮/美白/清晰度 → 新 blob URL。
 *
 * 使用 common 的纯 JS 算法（与测试同一实现），canvas 2D 逐像素处理；
 * 处理前按 maxEdge 等比缩放，控制内存与耗时。调用方负责 revoke 返回的 blob URL。
 */

/** 像素增强参数：美颜（磨皮/美白）与清晰度（边缘锐化），全部为 0..1。 */
export type EnhanceParams = Readonly<{
  beautySmooth: number
  beautyWhiten: number
  clarity: number
}>

const FALLBACK_MAX_EDGE = 0
const BEAUTY_MIME = 'image/webp'
const BEAUTY_QUALITY = 0.92

export async function loadImageBitmap(sourceUrl: string): Promise<ImageBitmap> {
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`无法读取图片：${response.status}`)
  const blob = await response.blob()
  return createImageBitmap(blob)
}

export function scaleDown(
  size: { width: number; height: number },
  maxEdge: number | undefined
): { width: number; height: number } {
  if (!maxEdge || maxEdge <= 0) return { width: size.width, height: size.height }
  const longest = Math.max(size.width, size.height)
  if (longest <= maxEdge) return { width: size.width, height: size.height }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale))
  }
}

function isEnhanceActive(params: EnhanceParams): boolean {
  return params.beautySmooth > 0 || params.beautyWhiten > 0 || params.clarity > 0
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, BEAUTY_MIME, BEAUTY_QUALITY))
}

/**
 * 对图片 URL 应用磨皮/美白/清晰度，返回处理后的 blob URL。
 *
 * @param sourceUrl 原图 URL（桌面 album-asset: 或 Web blob:，均可被 fetch）
 * @param params 磨皮/美白/清晰度强度（全 0 时直接返回原 URL，零开销）
 * @param maxEdge 处理前的最长边上限；缺省 0 表示不缩放（保证 print 分辨率），编辑预览可传 2048
 * @returns 处理后的 blob URL；canvas 不可用或处理失败时降级返回原 URL
 */
export async function beautifyImageSource(
  sourceUrl: string,
  params: EnhanceParams,
  maxEdge: number | undefined = FALLBACK_MAX_EDGE
): Promise<string> {
  if (!isEnhanceActive(params)) return sourceUrl

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await loadImageBitmap(sourceUrl)
    const { width, height } = scaleDown(bitmap, maxEdge)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return sourceUrl

    context.drawImage(bitmap, 0, 0, width, height)
    const imageData = context.getImageData(0, 0, width, height)
    const beautified = applyBeautyToPixels(imageData.data, width, height, params)
    const processed = applyClarityToPixels(beautified, width, height, params)
    imageData.data.set(processed)
    context.putImageData(imageData, 0, 0)

    const blob = await canvasToBlob(canvas)
    if (!blob) return sourceUrl
    return URL.createObjectURL(blob)
  } catch {
    return sourceUrl
  } finally {
    bitmap?.close()
  }
}
