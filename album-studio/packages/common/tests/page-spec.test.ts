import { describe, expect, it } from 'vitest'
import {
  PAGE_SPEC_PRESETS,
  pageSpecAspectRatio,
  pageSpecSizeAtDpi,
  pageSpecSizeInInches
} from '../src'

describe('page spec measurements', () => {
  it.each([
    ['a4-landscape', { width: 3508, height: 2480 }],
    ['square-12', { width: 3600, height: 3600 }],
    ['widescreen-16-9', { width: 4000, height: 2250 }]
  ] as const)('converts %s to its 300 DPI pixel target', (presetId, expected) => {
    const pageSpec = PAGE_SPEC_PRESETS.find((preset) => preset.presetId === presetId)
    if (!pageSpec) throw new Error(`找不到页面预设：${presetId}`)
    expect(pageSpecSizeAtDpi(pageSpec, 300)).toEqual(expected)
  })

  it('provides aspect ratios and exact inch measurements from the same preset', () => {
    expect(pageSpecAspectRatio(PAGE_SPEC_PRESETS[1])).toBe(1)
    const size = pageSpecSizeInInches(PAGE_SPEC_PRESETS[1])
    expect(size.width).toBeCloseTo(12)
    expect(size.height).toBeCloseTo(12)
  })

  it('rejects invalid DPI values', () => {
    expect(() => pageSpecSizeAtDpi(PAGE_SPEC_PRESETS[0], 0)).toThrow(/DPI/)
  })
})
