import createPica from 'pica'
import { createSHA256 } from 'hash-wasm'
import { coverImageDerivativeSize, type ImageCrop, type PixelSize } from '@album-studio/common'

export const MAX_IMAGE_PIXELS = 80_000_000
const pica = createPica({ concurrency: 2, features: ['js', 'wasm', 'ww'] })

export type BrowserImageMetadata = {
  contentHash: string
  width: number
  height: number
}

export type WebpDerivativeBounds = Readonly<{
  width: number
  height: number
  quality: number
  fit?: 'inside' | 'cover'
  crop?: ImageCrop
  maximumPixels?: number
}>

export function derivativeCanvasSize(
  sourceSize: PixelSize,
  bounds: WebpDerivativeBounds
): PixelSize {
  if (bounds.fit === 'cover') {
    return coverImageDerivativeSize({
      sourceSize,
      viewportSize: bounds,
      crop: bounds.crop,
      maximumPixels: bounds.maximumPixels
    })
  }
  const scale = Math.min(1, bounds.width / sourceSize.width, bounds.height / sourceSize.height)
  return {
    width: Math.max(1, Math.round(sourceSize.width * scale)),
    height: Math.max(1, Math.round(sourceSize.height * scale))
  }
}

export async function hashBlob(blob: Blob): Promise<string> {
  const hasher = await createSHA256()
  const reader = blob.stream().getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) return hasher.digest()
    hasher.update(value)
  }
}

export async function inspectImage(file: File): Promise<BrowserImageMetadata> {
  const [hashResult, bitmapResult] = await Promise.allSettled([
    hashBlob(file),
    createImageBitmap(file, { imageOrientation: 'from-image' })
  ])
  if (bitmapResult.status === 'rejected') throw new Error('图片无法解码或文件内容损坏')
  const bitmap = bitmapResult.value
  if (hashResult.status === 'rejected') {
    bitmap.close()
    throw new Error('无法读取图片内容')
  }
  const contentHash = hashResult.value
  const { width, height } = bitmap
  bitmap.close()
  if (width <= 0 || height <= 0 || width * height > MAX_IMAGE_PIXELS) {
    throw new Error('图片尺寸无效或像素数超过 8000 万上限')
  }
  return { contentHash, width, height }
}

export async function createWebpDerivative(
  source: Blob,
  bounds: WebpDerivativeBounds
): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  try {
    const output = derivativeCanvasSize(bitmap, bounds)
    const targetCanvas = document.createElement('canvas')
    targetCanvas.width = output.width
    targetCanvas.height = output.height

    await pica.resize(bitmap, targetCanvas)
    return pica.toBlob(targetCanvas, 'image/webp', bounds.quality)
  } finally {
    bitmap.close()
  }
}

export function extensionForMimeType(mimeType: string): string {
  const extensions: Record<string, string> = {
    'image/avif': 'avif',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/tiff': 'tiff',
    'image/webp': 'webp'
  }
  const extension = extensions[mimeType.toLowerCase()]
  if (!extension) throw new Error(`不支持的图片格式：${mimeType || '未知格式'}`)
  return extension
}
