import { describe, expect, it } from 'vitest'
import { AUTO_ENHANCE_CONSTANTS, analyzeAutoEnhance } from '../src'

function solidPixels(
  rgb: [number, number, number],
  width: number,
  height: number
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    pixels[offset] = rgb[0]
    pixels[offset + 1] = rgb[1]
    pixels[offset + 2] = rgb[2]
    pixels[offset + 3] = 255
  }
  return pixels
}

/** 用一组 RGB 颜色循环填充 width × height 像素。 */
function mixedPixels(
  colors: ReadonlyArray<readonly [number, number, number]>,
  width: number,
  height: number
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const rgb = colors[index % colors.length]
    const offset = index * 4
    pixels[offset] = rgb[0]
    pixels[offset + 1] = rgb[1]
    pixels[offset + 2] = rgb[2]
    pixels[offset + 3] = 255
  }
  return pixels
}

function pixelsWithAlpha(
  colors: ReadonlyArray<readonly [number, number, number, number]>
): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flatMap((color) => [...color]))
}

describe('analyzeAutoEnhance', () => {
  it('欠曝照片提亮亮度（目标中灰，封顶到安全上限）', () => {
    // 平均亮度 60/255 ≈ 0.235 < 0.42 → 0.5/0.235 ≈ 2.13 → 夹到 1.3
    const result = analyzeAutoEnhance(solidPixels([60, 60, 60], 4, 4), 4, 4)
    expect(result.brightness).toBe(AUTO_ENHANCE_CONSTANTS.brightnessMax)
    expect(result.brightness).toBeGreaterThan(1)
  })

  it('过曝照片压暗亮度（不高于原样）', () => {
    // 平均亮度 200/255 ≈ 0.784 > 0.62 → 0.5/0.784 ≈ 0.64 → 夹到下限 0.7
    const result = analyzeAutoEnhance(solidPixels([200, 200, 200], 4, 4), 4, 4)
    expect(result.brightness).toBe(AUTO_ENHANCE_CONSTANTS.brightnessMin)
    expect(result.brightness).toBeLessThan(1)
  })

  it('亮度适中的照片不调整亮度', () => {
    // 平均亮度 128/255 ≈ 0.50，处于 [0.42, 0.62] 中性区间
    const result = analyzeAutoEnhance(solidPixels([128, 128, 128], 4, 4), 4, 4)
    expect(result.brightness).toBe(1)
  })

  it('亮度按目标比例修正并保留两位小数', () => {
    // 平均亮度 102/255 = 0.4 → 0.5/0.4 = 1.25（干净小数）
    const result = analyzeAutoEnhance(solidPixels([102, 102, 102], 4, 4), 4, 4)
    expect(result.brightness).toBe(1.25)
  })

  it('平灰照片提升对比度（按分位跨度补足，封顶）', () => {
    // 90..150 亮度跨度 60/255 ≈ 0.235 < 0.35 → 0.55/0.235 ≈ 2.34 → 夹到 1.3
    const result = analyzeAutoEnhance(
      mixedPixels(
        [
          [90, 90, 90],
          [150, 150, 150]
        ],
        4,
        4
      ),
      4,
      4
    )
    expect(result.contrast).toBe(AUTO_ENHANCE_CONSTANTS.contrastMax)
    expect(result.contrast).toBeGreaterThan(1)
  })

  it('高对比照片不再提升对比度', () => {
    // 黑 + 白分位跨度 ≈ 1 > 0.35
    const result = analyzeAutoEnhance(
      mixedPixels(
        [
          [0, 0, 0],
          [255, 255, 255]
        ],
        4,
        4
      ),
      4,
      4
    )
    expect(result.contrast).toBe(1)
  })

  it('纯色（零跨度）照片对比度补足到上限', () => {
    const result = analyzeAutoEnhance(solidPixels([120, 120, 120], 4, 4), 4, 4)
    expect(result.contrast).toBe(AUTO_ENHANCE_CONSTANTS.contrastMax)
  })

  it('低彩照片提升饱和度（按目标彩度补足，封顶）', () => {
    // (128,128,140) 彩度 12/255 ≈ 0.047 ∈ [0.015, 0.12) → 0.22/0.047 ≈ 4.7 → 夹到 1.3
    const result = analyzeAutoEnhance(solidPixels([128, 128, 140], 4, 4), 4, 4)
    expect(result.saturation).toBe(AUTO_ENHANCE_CONSTANTS.saturationMax)
    expect(result.saturation).toBeGreaterThan(1)
  })

  it('黑白照片不追加饱和度', () => {
    const result = analyzeAutoEnhance(solidPixels([100, 100, 100], 4, 4), 4, 4)
    expect(result.saturation).toBe(1)
  })

  it('色彩鲜艳的照片不再提升饱和度', () => {
    // 纯红 + 纯蓝 + 纯绿平均彩度 ≈ 1
    const result = analyzeAutoEnhance(
      mixedPixels(
        [
          [255, 0, 0],
          [0, 255, 0],
          [0, 0, 255]
        ],
        3,
        3
      ),
      3,
      3
    )
    expect(result.saturation).toBe(1)
  })

  it('状态正常的照片三参数全部保持中性', () => {
    // 平均亮度 ≈ 0.51、跨度 ≈ 0.55 ≥ 0.35、黑白照片 → 全部 1
    const result = analyzeAutoEnhance(
      mixedPixels(
        [
          [60, 60, 60],
          [200, 200, 200]
        ],
        4,
        4
      ),
      4,
      4
    )
    expect(result).toEqual({ brightness: 1, contrast: 1, saturation: 1 })
  })

  it('透明像素不会被当成黑色背景误提亮', () => {
    const opaque = analyzeAutoEnhance(
      pixelsWithAlpha([
        [60, 60, 60, 255],
        [200, 200, 200, 255]
      ]),
      2,
      1
    )
    const withTransparentCorners = analyzeAutoEnhance(
      pixelsWithAlpha([
        [60, 60, 60, 255],
        [200, 200, 200, 255],
        ...Array.from({ length: 14 }, () => [0, 0, 0, 0] as const)
      ]),
      4,
      4
    )

    expect(withTransparentCorners).toEqual(opaque)
    expect(withTransparentCorners.brightness).toBe(1)
  })

  it('全透明图像返回中性参数', () => {
    expect(analyzeAutoEnhance(new Uint8ClampedArray(4 * 4 * 4), 4, 4)).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1
    })
  })

  it('空输入返回中性参数', () => {
    expect(analyzeAutoEnhance(new Uint8ClampedArray(0), 0, 0)).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1
    })
    expect(analyzeAutoEnhance(new Uint8ClampedArray(8), 2, 2)).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1
    })
  })
})
