import type { EraseStroke } from '@album-studio/common'

/** 二值遮罩：0 = 不处理，255 = 要修补。 */
export type BinaryMask = Uint8Array

export function emptyMask(width: number, height: number): BinaryMask {
  return new Uint8Array(width * height)
}

/**
 * 最终遮罩 = 自动识别遮罩 ∪ 笔划（add 叠加 / subtract 抠除）。
 * 笔划坐标为归一化值，笔刷直径按图片宽度换算；全程在原始分辨率上计算，
 * 由 LaMa 管线再缩放到模型输入，保证与渲染一致。
 */
export function mergeEraseMask(
  autoMask: BinaryMask,
  width: number,
  height: number,
  autoDetect: boolean,
  strokes: readonly EraseStroke[]
): BinaryMask {
  const merged = autoDetect ? Uint8Array.from(autoMask) : emptyMask(width, height)
  for (const stroke of strokes) {
    rasterizeStroke(merged, width, height, stroke)
  }
  return merged
}

export function rasterizeStroke(
  mask: BinaryMask,
  width: number,
  height: number,
  stroke: EraseStroke
): void {
  const radius = Math.max(1, (stroke.size * width) / 2)
  const step = Math.max(1, Math.floor(radius / 2))
  const value = stroke.mode === 'add' ? 255 : 0

  const toPixel = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: point.x * width,
    y: point.y * height
  })

  let previous = toPixel(stroke.points[0])
  stampCircle(mask, width, height, previous.x, previous.y, radius, value)
  for (let index = 1; index < stroke.points.length; index++) {
    const current = toPixel(stroke.points[index])
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y)
    const samples = Math.max(1, Math.ceil(distance / step))
    for (let sample = 1; sample <= samples; sample++) {
      const t = sample / samples
      stampCircle(
        mask,
        width,
        height,
        previous.x + (current.x - previous.x) * t,
        previous.y + (current.y - previous.y) * t,
        radius,
        value
      )
    }
    previous = current
  }
}

function stampCircle(
  mask: BinaryMask,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  value: number
): void {
  const minX = Math.max(0, Math.floor(centerX - radius))
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius))
  const minY = Math.max(0, Math.floor(centerY - radius))
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius))
  const radiusSquared = radius * radius
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - centerX
      const dy = y - centerY
      if (dx * dx + dy * dy <= radiusSquared) {
        mask[y * width + x] = value
      }
    }
  }
}
