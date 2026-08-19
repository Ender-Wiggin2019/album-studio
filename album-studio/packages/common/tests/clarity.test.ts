import { describe, expect, it } from 'vitest'
import { CLARITY_CONSTANTS, applyClarityToPixels } from '../src'

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

describe('applyClarityToPixels', () => {
  it('returns a copy and leaves the input untouched when disabled', () => {
    const input = solidPixels([128, 128, 128], 4, 4)
    const output = applyClarityToPixels(input, 4, 4, { clarity: 0 })
    expect(output).not.toBe(input)
    expect(output).toEqual(input)
  })

  it('does not change a uniform image (blur equals source everywhere)', () => {
    const pixels = solidPixels([100, 120, 140], 3, 3)
    const output = applyClarityToPixels(pixels, 3, 3, { clarity: 1 })
    expect(output).toEqual(pixels)
  })

  it('enhances edges monotonically with strength', () => {
    // 3×3：周围 128，中心 200。中心与邻域均值的差会被放大（unsharp mask）。
    const width = 3
    const height = 3
    const pixels = solidPixels([128, 128, 128], width, height)
    const center = (1 * width + 1) * 4
    pixels[center] = 200
    pixels[center + 1] = 200
    pixels[center + 2] = 200

    const half = applyClarityToPixels(pixels, width, height, { clarity: 0.5 })[center]
    const full = applyClarityToPixels(pixels, width, height, { clarity: 1 })[center]
    expect(half).toBeGreaterThan(200)
    expect(full).toBeGreaterThan(half)
    // 拉满时 amount=1.4：200 + 1.4×(200−136) ≈ 289.6，必然 clamp 到 255
    expect(full).toBe(255)
  })

  it('clamps darkened edges to 0 and never underflows', () => {
    // 3×3：周围 200，中心 80。锐化后中心更低，低强度下不应越过 0。
    const width = 3
    const height = 3
    const pixels = solidPixels([200, 200, 200], width, height)
    const center = (1 * width + 1) * 4
    pixels[center] = 80
    pixels[center + 1] = 80
    pixels[center + 2] = 80

    const output = applyClarityToPixels(pixels, width, height, { clarity: 1 })
    // blur=(8×200+80)/9≈186.7，amount=1.4 → 80+1.4×(80−186.7)≈−69.3 → 0
    expect(output[center]).toBe(0)
    expect(output[center + 1]).toBe(0)
    expect(output[center + 2]).toBe(0)
  })

  it('exposes the shared constants used by the rendering pipeline', () => {
    expect(CLARITY_CONSTANTS.maxAmount).toBe(1.4)
  })
})
