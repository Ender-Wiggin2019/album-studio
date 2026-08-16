import { CreateProjectRequestSchema } from '../src'
import { describe, expect, it } from 'vitest'

describe('CreateProjectRequestSchema', () => {
  it.each([
    { presetId: 'a4-landscape', widthMm: 297, heightMm: 210 },
    { presetId: 'square-12', widthMm: 304.8, heightMm: 304.8 },
    { presetId: 'widescreen-16-9', widthMm: 338.67, heightMm: 190.5 }
  ] as const)('accepts the $presetId page preset', (pageSpec) => {
    expect(
      CreateProjectRequestSchema.parse({
        title: '旅行手记',
        themeId: 'journal',
        pageSpec
      })
    ).toEqual({ title: '旅行手记', themeId: 'journal', pageSpec })
  })

  it('requires the caller to choose one authoritative page preset', () => {
    expect(() =>
      CreateProjectRequestSchema.parse({ title: '旅行手记', themeId: 'journal' })
    ).toThrow()
    expect(() =>
      CreateProjectRequestSchema.parse({
        title: '旅行手记',
        themeId: 'journal',
        pageSpec: { presetId: 'square-12', widthMm: 297, heightMm: 210 }
      })
    ).toThrow()
  })
})
