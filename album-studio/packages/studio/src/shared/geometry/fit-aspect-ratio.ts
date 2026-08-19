export type FittedSize = Readonly<{ width: number; height: number }>

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function measureElementContentBox(element: HTMLElement): FittedSize | null {
  const style = getComputedStyle(element)
  const width = element.clientWidth - cssPixels(style.paddingLeft) - cssPixels(style.paddingRight)
  const height = element.clientHeight - cssPixels(style.paddingTop) - cssPixels(style.paddingBottom)
  return width > 0 && height > 0 ? { width, height } : null
}

export function fitAspectRatioWithin({
  aspectRatio,
  availableWidth,
  availableHeight,
  maxWidth = Number.POSITIVE_INFINITY
}: {
  aspectRatio: number
  availableWidth: number
  availableHeight: number
  maxWidth?: number
}): FittedSize | null {
  if (
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0 ||
    !Number.isFinite(availableWidth) ||
    availableWidth <= 0 ||
    !Number.isFinite(availableHeight) ||
    availableHeight <= 0 ||
    Number.isNaN(maxWidth) ||
    maxWidth <= 0
  ) {
    return null
  }

  const width = Math.min(availableWidth, availableHeight * aspectRatio, maxWidth)
  return { width, height: width / aspectRatio }
}
