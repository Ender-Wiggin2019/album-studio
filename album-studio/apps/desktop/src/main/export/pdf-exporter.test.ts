import type { PageSpec } from '@album-studio/common'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ dialog: { showSaveDialog: vi.fn() } }))

import { pdfPageSizeForPageSpec } from './pdf-exporter'

const PAGE_SPECS = {
  a4: { presetId: 'a4-landscape', widthMm: 297, heightMm: 210 },
  square: { presetId: 'square-12', widthMm: 304.8, heightMm: 304.8 },
  widescreen: { presetId: 'widescreen-16-9', widthMm: 338.67, heightMm: 190.5 }
} as const satisfies Record<string, PageSpec>

describe('pdfPageSizeForPageSpec', () => {
  it.each([
    [PAGE_SPECS.a4, 297 / 25.4, 210 / 25.4],
    [PAGE_SPECS.square, 12, 12],
    [PAGE_SPECS.widescreen, 338.67 / 25.4, 7.5]
  ] as const)('converts %s millimeters to Electron pageSize inches', (pageSpec, width, height) => {
    const pageSize = pdfPageSizeForPageSpec(pageSpec)

    expect(pageSize.width).toBeCloseTo(width, 10)
    expect(pageSize.height).toBeCloseTo(height, 10)
  })

  it('rejects dimensions that do not match the selected preset', () => {
    expect(() =>
      pdfPageSizeForPageSpec({
        presetId: 'a4-landscape',
        widthMm: 210,
        heightMm: 297
      } as unknown as PageSpec)
    ).toThrow()
  })
})
