import { describe, expect, it } from 'vitest'
import { fitAspectRatioWithin, measureElementContentBox } from './fit-aspect-ratio'

describe('fitAspectRatioWithin', () => {
  it.each([
    ['A4 横向', 297 / 210, { width: 565.7142857142857, height: 400 }],
    ['A4 竖排', 210 / 297, { width: 282.82828282828285, height: 400 }],
    ['12 寸方形', 1, { width: 400, height: 400 }],
    ['16:9 宽屏', 16 / 9, { width: 600, height: 337.5 }]
  ])('contains %s inside both 600 × 400 bounds', (_, aspectRatio, expected) => {
    const result = fitAspectRatioWithin({ aspectRatio, availableWidth: 600, availableHeight: 400 })

    expect(result?.width).toBeCloseTo(expected.width)
    expect(result?.height).toBeCloseTo(expected.height)
  })

  it('honors the shared maximum page width without changing the ratio', () => {
    const result = fitAspectRatioWithin({
      aspectRatio: 16 / 9,
      availableWidth: 2_000,
      availableHeight: 2_000,
      maxWidth: 1_100
    })

    expect(result).toEqual({ width: 1_100, height: 618.75 })
  })

  it.each([
    { aspectRatio: 0, availableWidth: 600, availableHeight: 400 },
    { aspectRatio: Number.NaN, availableWidth: 600, availableHeight: 400 },
    { aspectRatio: 1, availableWidth: 0, availableHeight: 400 },
    { aspectRatio: 1, availableWidth: 600, availableHeight: -1 }
  ])('returns null for invalid bounds %#', (input) => {
    expect(fitAspectRatioWithin(input)).toBeNull()
  })

  it('measures the usable content box inside container padding', () => {
    const element = document.createElement('div')
    element.style.padding = '20px 30px'
    Object.defineProperties(element, {
      clientWidth: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 400 }
    })

    expect(measureElementContentBox(element)).toEqual({ width: 540, height: 360 })
  })
})
