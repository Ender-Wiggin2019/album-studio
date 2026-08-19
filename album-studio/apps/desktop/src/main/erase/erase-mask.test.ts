import { describe, expect, it } from 'vitest'
import { emptyMask, mergeEraseMask, rasterizeStroke } from './erase-mask'

describe('erase mask', () => {
  it('stamps add strokes as filled circles along the path', () => {
    const width = 100
    const height = 100
    const mask = emptyMask(width, height)
    rasterizeStroke(mask, width, height, {
      mode: 'add',
      size: 0.2, // 直径 20px，半径 10
      points: [
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.5 }
      ]
    })
    expect(mask[50 * width + 50]).toBe(255)
    expect(mask[50 * width + 58]).toBe(255) // 半径内
    expect(mask[50 * width + 62]).toBe(0) // 半径外
  })

  it('connects consecutive stroke points with a thick line', () => {
    const width = 100
    const height = 100
    const mask = emptyMask(width, height)
    rasterizeStroke(mask, width, height, {
      mode: 'add',
      size: 0.1,
      points: [
        { x: 0.1, y: 0.5 },
        { x: 0.9, y: 0.5 }
      ]
    })
    expect(mask[50 * width + 10]).toBe(255)
    expect(mask[50 * width + 50]).toBe(255)
    expect(mask[50 * width + 90]).toBe(255)
  })

  it('subtract strokes erase from the auto-detected mask', () => {
    const width = 100
    const height = 100
    const auto = new Uint8Array(width * height)
    auto.fill(255)
    const merged = mergeEraseMask(auto, width, height, true, [
      {
        mode: 'subtract',
        size: 0.1,
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.5, y: 0.5 }
        ]
      }
    ])
    expect(merged[50 * width + 50]).toBe(0)
    expect(merged[10 * width + 10]).toBe(255) // 远处保持自动遮罩
  })

  it('ignores the auto mask when autoDetect is disabled', () => {
    const width = 100
    const height = 100
    const auto = new Uint8Array(width * height)
    auto.fill(255)
    const merged = mergeEraseMask(auto, width, height, false, [])
    expect(merged[50 * width + 50]).toBe(0)
    expect(merged.every((value) => value === 0)).toBe(true)
  })

  it('clamps stroke pixels to image bounds', () => {
    const width = 100
    const height = 100
    const mask = emptyMask(width, height)
    rasterizeStroke(mask, width, height, {
      mode: 'add',
      size: 0.5,
      points: [
        { x: 0, y: 0 },
        { x: 0.01, y: 0 }
      ]
    })
    expect(mask[0]).toBe(255)
  })
})
