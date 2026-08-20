import { RICH_TEXT_FONT_FAMILIES } from '@album-studio/common'
import { describe, expect, it } from 'vitest'
import {
  RICH_TEXT_FONT_CATALOG,
  richTextCssToFontFamily,
  richTextFontFamilyToCss
} from './rich-text-fonts'

describe('rich-text font catalog', () => {
  it('lists every strict font ID once with featured Chinese fonts first', () => {
    expect(RICH_TEXT_FONT_CATALOG.map((font) => font.family)).toEqual(RICH_TEXT_FONT_FAMILIES)
    expect(RICH_TEXT_FONT_CATALOG.filter((font) => font.group === 'featured')).toMatchObject([
      { family: 'smiley-sans', label: '得意黑' },
      { family: 'lxgw-wenkai', label: '霞鹜文楷' },
      { family: 'lxgw-marker', label: '霞鹜漫黑' },
      { family: 'xiaolai', label: '小赖字体' }
    ])
    for (const font of RICH_TEXT_FONT_CATALOG) {
      expect(richTextCssToFontFamily(richTextFontFamilyToCss(font.family))).toBe(font.family)
    }
  })
})
