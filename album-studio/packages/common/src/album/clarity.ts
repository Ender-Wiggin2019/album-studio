/**
 * 图片清晰度（边缘锐化）的像素级参考实现。
 *
 * 使用经典 unsharp mask：out = src + amount × (src − blur)，blur 为 3×3 邻域均值，
 * amount = clarity × CLARITY_CONSTANTS.maxAmount。与美颜管线共用同一 canvas 2D
 * 逐像素执行路径，保证桌面/Web 与测试三处结果一致。
 */

export type ClarityParams = Readonly<{
  /** 清晰度强度 0..1。 */
  clarity: number
}>

/**
 * 清晰度算法的全部可调常量，供渲染管线与测试共用，避免双实现漂移。
 */
export const CLARITY_CONSTANTS = Object.freeze({
  /** 清晰度拉满时的锐化量（unsharp amount）。 */
  maxAmount: 1.4
} as const)

const NEIGHBOR_OFFSETS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1]
] as const

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/**
 * 对 RGBA 像素应用边缘锐化（清晰度），返回新数组（不修改入参）。
 *
 * @param pixels RGBA 像素（Uint8ClampedArray），长度必须为 width * height * 4
 */
export function applyClarityToPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  params: ClarityParams
): Uint8ClampedArray {
  if (width <= 0 || height <= 0) return new Uint8ClampedArray(pixels)
  const clarity = clamp01(params.clarity)
  if (clarity === 0) return new Uint8ClampedArray(pixels)

  const amount = clarity * CLARITY_CONSTANTS.maxAmount
  const output = new Uint8ClampedArray(pixels)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      let rSum = 0
      let gSum = 0
      let bSum = 0
      for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        const nx = x + dx
        const ny = y + dy
        const clampedX = nx < 0 ? 0 : nx >= width ? width - 1 : nx
        const clampedY = ny < 0 ? 0 : ny >= height ? height - 1 : ny
        const neighborOffset = (clampedY * width + clampedX) * 4
        rSum += pixels[neighborOffset]
        gSum += pixels[neighborOffset + 1]
        bSum += pixels[neighborOffset + 2]
      }
      const rBlur = rSum / 9
      const gBlur = gSum / 9
      const bBlur = bSum / 9

      const r = pixels[offset] + amount * (pixels[offset] - rBlur)
      const g = pixels[offset + 1] + amount * (pixels[offset + 1] - gBlur)
      const b = pixels[offset + 2] + amount * (pixels[offset + 2] - bBlur)
      output[offset] = r > 255 ? 255 : r < 0 ? 0 : r
      output[offset + 1] = g > 255 ? 255 : g < 0 ? 0 : g
      output[offset + 2] = b > 255 ? 255 : b < 0 ? 0 : b
    }
  }
  return output
}
