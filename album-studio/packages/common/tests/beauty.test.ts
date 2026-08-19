import { describe, expect, it } from 'vitest'
import { DEFAULT_IMAGE_EFFECTS, ImageEffectsSchema, applyBeautyToPixels, skinWeight } from '../src'

function solidPixels(rgb: [number, number, number], width: number, height: number): Uint8ClampedArray {
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

describe('skin weight detection', () => {
  it('marks typical skin tone pixels as skin', () => {
    // YCbCr 肤色区间（Cb≈77-127, Cr≈133-173）内的常见肤色 RGB
    expect(skinWeight(230, 178, 150)).toBeGreaterThan(0.5)
    expect(skinWeight(200, 150, 120)).toBeGreaterThan(0.5)
  })

  it('marks clearly non-skin colors as zero', () => {
    expect(skinWeight(0, 0, 255)).toBe(0)
    expect(skinWeight(255, 0, 0)).toBe(0)
    expect(skinWeight(0, 255, 0)).toBe(0)
  })

  it('fades out on very dark or very bright pixels', () => {
    expect(skinWeight(5, 4, 3)).toBe(0)
    expect(skinWeight(250, 250, 250)).toBe(0)
  })
})

describe('applyBeautyToPixels', () => {
  it('returns a copy and leaves the input untouched when disabled', () => {
    const input = solidPixels([200, 150, 120], 4, 4)
    const output = applyBeautyToPixels(input, 4, 4, { beautySmooth: 0, beautyWhiten: 0 })
    expect(output).not.toBe(input)
    expect(output).toEqual(input)
  })

  it('smooths skin-toned regions when smooth > 0', () => {
    // 肤色中心像素与 8 邻域均为肤色：磨皮后中心向邻域平均收敛（趋近平滑）
    const width = 3
    const height = 3
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        const darker = x === 1 && y === 1
        pixels[offset] = darker ? 170 : 200
        pixels[offset + 1] = darker ? 120 : 150
        pixels[offset + 2] = darker ? 95 : 120
        pixels[offset + 3] = 255
      }
    }
    const before = pixels[1 * width * 4 + 1 * 4]
    const output = applyBeautyToPixels(pixels, width, height, { beautySmooth: 1, beautyWhiten: 0 })
    const after = output[1 * width * 4 + 1 * 4]
    expect(after).toBeGreaterThan(before)
    expect(after).toBeLessThan(200)
  })

  it('brightens skin-toned pixels when whiten > 0 and leaves zero-weight pixels alone', () => {
    const width = 2
    const height = 1
    const pixels = new Uint8ClampedArray(width * height * 4)
    // 像素 0：肤色；像素 1：纯蓝（非肤色）
    pixels[0] = 200
    pixels[1] = 150
    pixels[2] = 120
    pixels[3] = 255
    pixels[4] = 0
    pixels[5] = 0
    pixels[6] = 255
    pixels[7] = 255

    const output = applyBeautyToPixels(pixels, width, height, { beautySmooth: 0, beautyWhiten: 1 })
    expect(output[0]).toBeGreaterThan(200)
    expect(output[1]).toBeGreaterThan(150)
    expect(output[2]).toBeGreaterThan(120)
    expect(output[4]).toBe(0)
    expect(output[5]).toBe(0)
    expect(output[6]).toBe(255)
  })

  it('clamps whitened values to 255', () => {
    // 典型肤色 (230,178,150)：肤色权重接近 1，whiten=1 时 boost=1.35 → R 必然 clamp 到 255
    const pixels = solidPixels([230, 178, 150], 1, 1)
    const output = applyBeautyToPixels(pixels, 1, 1, { beautySmooth: 0, beautyWhiten: 1 })
    expect(output[0]).toBe(255)
    expect(output[1]).toBeLessThanOrEqual(255)
  })

  it('accepts the schema-validated default effects as no-op', () => {
    const effects = ImageEffectsSchema.parse(DEFAULT_IMAGE_EFFECTS)
    const pixels = solidPixels([200, 150, 120], 3, 3)
    expect(applyBeautyToPixels(pixels, 3, 3, effects)).toEqual(pixels)
  })
})
