/**
 * 自动美化（自动曝光 / 对比度 / 饱和度）分析算法。
 *
 * 输入 RGBA 像素（建议为缩小后的分析图），统计亮度直方图（均值 + p5/p95 分位）
 * 与平均彩度，输出与 `ImageEffects` 一致的 brightness/contrast/saturation 参数。
 * 只修正明显缺陷（欠曝 / 过曝 / 平灰 / 低彩），状态正常的照片保持中性参数；
 * 结果以参数写入，不生成派生图片，桌面 / Web 与测试共用同一实现。
 */

export const AUTO_ENHANCE_CONSTANTS = Object.freeze({
  /** 自动曝光目标平均亮度（0..1，接近中灰）。 */
  targetMeanLuminance: 0.5,
  /** 平均亮度低于此值视为欠曝，才提亮。 */
  darkMeanThreshold: 0.42,
  /** 平均亮度高于此值视为过曝，才压暗。 */
  brightMeanThreshold: 0.62,
  /** 亮度参数边界（CSS brightness 可表达的安全区间）。 */
  brightnessMin: 0.7,
  brightnessMax: 1.3,
  /** 对比度目标 p5-p95 分位跨度（0..1）。 */
  targetSpread: 0.55,
  /** 分位跨度低于此值视为平灰，才提对比。 */
  flatSpreadThreshold: 0.35,
  contrastMax: 1.3,
  /** 饱和度目标平均彩度（max-min 色差，0..1）。 */
  targetChroma: 0.22,
  /** 平均彩度低于此值视为低彩，才加饱和。 */
  dullChromaThreshold: 0.12,
  saturationMax: 1.3,
  /** 平均彩度低于此值视为黑白照片，不追加饱和。 */
  grayChromaThreshold: 0.015,
  /** 亮度直方图分位（低 / 高）。 */
  percentileLow: 0.05,
  percentileHigh: 0.95,
  /** 参数保留小数位。 */
  precision: 2
} as const)

export type AutoEnhanceResult = Readonly<{
  brightness: number
  contrast: number
  saturation: number
}>

/** RGB → 亮度系数（BT.601，与美颜模块一致）。 */
const Y_R = 0.299
const Y_G = 0.587
const Y_B = 0.114

const HISTOGRAM_BINS = 64
const NEUTRAL: AutoEnhanceResult = Object.freeze({ brightness: 1, contrast: 1, saturation: 1 })

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

/** 从亮度直方图取分位亮度（0..1，桶内线性插值）。 */
function percentile(histogram: Uint32Array, total: number, fraction: number): number {
  const target = fraction * total
  let accumulated = 0
  for (let bin = 0; bin < HISTOGRAM_BINS; bin += 1) {
    const count = histogram[bin]
    if (accumulated + count >= target) {
      const within = count === 0 ? 0 : (target - accumulated) / count
      return (bin + within) / HISTOGRAM_BINS
    }
    accumulated += count
  }
  return 1
}

/**
 * 分析 RGBA 像素并返回自动美化参数（brightness/contrast/saturation）。
 *
 * @param pixels RGBA 像素（Uint8ClampedArray），长度必须为 width * height * 4
 */
export function analyzeAutoEnhance(
  pixels: Uint8ClampedArray,
  width: number,
  height: number
): AutoEnhanceResult {
  const count = width * height
  if (count <= 0 || pixels.length < count * 4) return { ...NEUTRAL }

  const histogram = new Uint32Array(HISTOGRAM_BINS)
  let luminanceSum = 0
  let chromaSum = 0

  for (let index = 0; index < count; index += 1) {
    const offset = index * 4
    const r = pixels[offset] / 255
    const g = pixels[offset + 1] / 255
    const b = pixels[offset + 2] / 255
    luminanceSum += Y_R * r + Y_G * g + Y_B * b
    const max = r > g ? (r > b ? r : b) : g > b ? g : b
    const min = r < g ? (r < b ? r : b) : g < b ? g : b
    chromaSum += max - min
    let bin = Math.floor((Y_R * r + Y_G * g + Y_B * b) * HISTOGRAM_BINS)
    if (bin >= HISTOGRAM_BINS) bin = HISTOGRAM_BINS - 1
    histogram[bin] += 1
  }

  const meanY = luminanceSum / count
  const meanChroma = chromaSum / count
  const low = percentile(histogram, count, AUTO_ENHANCE_CONSTANTS.percentileLow)
  const high = percentile(histogram, count, AUTO_ENHANCE_CONSTANTS.percentileHigh)
  const spread = high - low

  const {
    targetMeanLuminance,
    darkMeanThreshold,
    brightMeanThreshold,
    brightnessMin,
    brightnessMax,
    targetSpread,
    flatSpreadThreshold,
    contrastMax,
    targetChroma,
    dullChromaThreshold,
    saturationMax,
    grayChromaThreshold,
    precision
  } = AUTO_ENHANCE_CONSTANTS

  let brightness = 1
  if (meanY < darkMeanThreshold) {
    brightness = clamp(targetMeanLuminance / meanY, brightnessMin, brightnessMax)
  } else if (meanY > brightMeanThreshold) {
    brightness = clamp(targetMeanLuminance / meanY, brightnessMin, 1)
  }

  let contrast = 1
  if (spread < flatSpreadThreshold) {
    contrast = spread > 0 ? clamp(targetSpread / spread, 1, contrastMax) : contrastMax
  }

  let saturation = 1
  if (meanChroma >= grayChromaThreshold && meanChroma < dullChromaThreshold) {
    saturation = clamp(targetChroma / meanChroma, 1, saturationMax)
  }

  return {
    brightness: round(brightness, precision),
    contrast: round(contrast, precision),
    saturation: round(saturation, precision)
  }
}
