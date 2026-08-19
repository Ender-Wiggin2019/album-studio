import { coverImageDerivativeSize, type PixelSize } from './crop'
import { pageSpecSizeAtDpi } from './page-spec'
import type { ImageCrop, PageSpec } from './schema'

export type PrintImageUsage = Readonly<{
  widthFraction: number
  heightFraction: number
}>

function usageFraction(value: number | undefined): number {
  const resolved = value ?? 1
  if (!Number.isFinite(resolved) || resolved <= 0 || resolved > 1) {
    throw new Error('打印元素尺寸必须是大于 0 且不超过 1 的页面比例。')
  }
  return resolved
}

export function printImageTargetSize(input: {
  pageSpec: PageSpec
  dpi: number
  usage?: Partial<PrintImageUsage>
}): PixelSize {
  const pageTarget = pageSpecSizeAtDpi(input.pageSpec, input.dpi)
  return {
    width: Math.max(1, Math.round(pageTarget.width * usageFraction(input.usage?.widthFraction))),
    height: Math.max(1, Math.round(pageTarget.height * usageFraction(input.usage?.heightFraction)))
  }
}

/**
 * 计算打印所需的完整原图派生尺寸：cover Block 可见区域，但不放大原图，
 * 且派生图总像素不超过同 DPI 的整页像素。
 */
export function printImageDerivativeSize(input: {
  sourceSize: PixelSize
  pageSpec: PageSpec
  dpi: number
  usage?: Partial<PrintImageUsage>
  crop?: ImageCrop
}): PixelSize {
  const pageTarget = pageSpecSizeAtDpi(input.pageSpec, input.dpi)
  return coverImageDerivativeSize({
    sourceSize: input.sourceSize,
    viewportSize: printImageTargetSize(input),
    crop: input.crop,
    maximumPixels: pageTarget.width * pageTarget.height
  })
}
