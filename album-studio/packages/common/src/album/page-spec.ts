import { PageSpecSchema, type PageSpec } from './schema'

export const MILLIMETERS_PER_INCH = 25.4

export function pageSpecAspectRatio(pageSpec: PageSpec): number {
  const parsed = PageSpecSchema.parse(pageSpec)
  return parsed.widthMm / parsed.heightMm
}

export function pageSpecSizeInInches(pageSpec: PageSpec): {
  width: number
  height: number
} {
  const parsed = PageSpecSchema.parse(pageSpec)
  return {
    width: parsed.widthMm / MILLIMETERS_PER_INCH,
    height: parsed.heightMm / MILLIMETERS_PER_INCH
  }
}

export function pageSpecSizeAtDpi(
  pageSpec: PageSpec,
  dpi: number
): { width: number; height: number } {
  if (!Number.isFinite(dpi) || dpi <= 0) throw new Error('DPI 必须是正数')
  const size = pageSpecSizeInInches(pageSpec)
  return {
    width: Math.round(size.width * dpi),
    height: Math.round(size.height * dpi)
  }
}
