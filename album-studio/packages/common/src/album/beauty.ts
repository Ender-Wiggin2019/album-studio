/**
 * 人物美颜（磨皮 + 美白）的像素级参考实现。
 *
 * 与 Studio 的 WebGL shader 使用同一套公式：RGB → YCbCr 肤色检测输出 0..1 权重，
 * 磨皮按肤色权重混合 3x3 邻域模糊，美白按肤色权重提亮。此实现供单元测试与
 * WebGL 不可用时的降级路径使用，保证桌面/Web 与测试三处结果一致。
 */

export type BeautyParams = Readonly<{
  /** 磨皮强度 0..1。 */
  beautySmooth: number
  /** 美白强度 0..1。 */
  beautyWhiten: number
}>

/**
 * 美颜算法的全部可调常量。Studio 的 WebGL shader 以此对象生成 GLSL 常量，
 * 保证 JS 参考实现与 GPU 实现使用完全相同的公式与阈值，避免双实现漂移。
 */
export const BEAUTY_CONSTANTS = Object.freeze({
  /** RGB → YCbCr 系数（BT.601）。 */
  ycbcrR: 0.299,
  ycbcrG: 0.587,
  ycbcrB: 0.114,
  crR: 0.5,
  crG: 0.418688,
  crB: 0.081312,
  cbR: 0.168736,
  cbG: 0.331264,
  /** 肤色亮度门控（Y），过暗或过亮不算肤色。 */
  skinYMin: 40,
  skinYMax: 235,
  /** 肤色 Cb/Cr 中心与过渡带（软阈值）。 */
  skinCbCenter: 102,
  skinCbHalf: 25,
  skinCbFallback: 10,
  skinCrCenter: 153,
  skinCrHalf: 20,
  skinCrFallback: 10,
  /** 美白提亮上限系数。 */
  whitenBoost: 0.35
} as const)

const {
  ycbcrR,
  ycbcrG,
  ycbcrB,
  crR,
  crG,
  crB,
  cbR,
  cbG,
  skinYMin,
  skinYMax,
  skinCbCenter,
  skinCbHalf,
  skinCbFallback,
  skinCrCenter,
  skinCrHalf,
  skinCrFallback,
  whitenBoost
} = BEAUTY_CONSTANTS

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

/** 单个 RGB 像素的肤色权重（0..1），使用 YCbCr 软阈值。 */
export function skinWeight(r: number, g: number, b: number): number {
  const y = ycbcrR * r + ycbcrG * g + ycbcrB * b
  if (y < skinYMin || y > skinYMax) return 0
  const cb = 128 - cbR * r - cbG * g + 0.5 * b
  const cr = 128 + crR * r - crG * g - crB * b
  const cbOk =
    1 - clamp01((Math.abs(cb - skinCbCenter) - (skinCbHalf - skinCbFallback)) / skinCbFallback)
  const crOk =
    1 - clamp01((Math.abs(cr - skinCrCenter) - (skinCrHalf - skinCrFallback)) / skinCrFallback)
  return cbOk * crOk
}

/**
 * 对 RGBA 像素应用磨皮与美白，返回新数组（不修改入参）。
 *
 * @param pixels RGBA 像素（Uint8ClampedArray），长度必须为 width * height * 4
 */
export function applyBeautyToPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  params: BeautyParams
): Uint8ClampedArray {
  if (width <= 0 || height <= 0) return new Uint8ClampedArray(pixels)
  const smooth = clamp01(params.beautySmooth)
  const whiten = clamp01(params.beautyWhiten)
  if (smooth === 0 && whiten === 0) return new Uint8ClampedArray(pixels)

  const count = width * height
  const skin = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4
    skin[index] = skinWeight(pixels[offset], pixels[offset + 1], pixels[offset + 2])
  }

  const output = new Uint8ClampedArray(pixels)
  const neighborOffsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [0, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ]

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const offset = index * 4
      const weight = skin[index]
      if (weight === 0) continue

      let rSum = 0
      let gSum = 0
      let bSum = 0
      for (const [dx, dy] of neighborOffsets) {
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

      let r = pixels[offset]
      let g = pixels[offset + 1]
      let b = pixels[offset + 2]
      if (smooth > 0) {
        r = r + (rBlur - r) * weight * smooth
        g = g + (gBlur - g) * weight * smooth
        b = b + (bBlur - b) * weight * smooth
      }
      if (whiten > 0) {
        const boost = 1 + weight * whiten * whitenBoost
        r *= boost
        g *= boost
        b *= boost
      }
      output[offset] = r > 255 ? 255 : r < 0 ? 0 : r
      output[offset + 1] = g > 255 ? 255 : g < 0 ? 0 : g
      output[offset + 2] = b > 255 ? 255 : b < 0 ? 0 : b
    }
  }
  return output
}
