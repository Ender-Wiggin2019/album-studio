import {
  RICH_TEXT_FONT_FAMILIES,
  RichTextFontFamilySchema,
  type RichTextFontFamily
} from '@album-studio/common'

export type RichTextFontGroup = 'featured' | 'compatible'

type RichTextFontMetadata = Readonly<{
  label: string
  group: RichTextFontGroup
  css: string
}>

export type RichTextFontOption = RichTextFontMetadata &
  Readonly<{
    family: RichTextFontFamily
  }>

const FONT_METADATA = {
  'smiley-sans': {
    label: '得意黑',
    group: 'featured',
    css: "'Album Smiley Sans', 'PingFang SC', 'Microsoft YaHei', sans-serif"
  },
  'lxgw-wenkai': {
    label: '霞鹜文楷',
    group: 'featured',
    css: "'Album LXGW WenKai Lite', 'Kaiti SC', 'STKaiti', serif"
  },
  'lxgw-marker': {
    label: '霞鹜漫黑',
    group: 'featured',
    css: "'Album LXGW Marker Gothic', 'PingFang SC', 'Microsoft YaHei', sans-serif"
  },
  xiaolai: {
    label: '小赖字体',
    group: 'featured',
    css: "'Album Xiaolai', 'Kaiti SC', 'STKaiti', cursive"
  },
  serif: {
    label: '宋体',
    group: 'compatible',
    css: "'Songti SC', 'STSong', 'SimSun', serif"
  },
  sans: {
    label: '黑体',
    group: 'compatible',
    css: "system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif"
  },
  handwritten: {
    label: '楷体',
    group: 'compatible',
    css: "'Kaiti SC', 'STKaiti', 'KaiTi', serif"
  },
  mono: {
    label: '等宽',
    group: 'compatible',
    css: "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', monospace"
  }
} as const satisfies Readonly<Record<RichTextFontFamily, RichTextFontMetadata>>

export const RICH_TEXT_FONT_CATALOG: readonly RichTextFontOption[] = RICH_TEXT_FONT_FAMILIES.map(
  (family) => ({ family, ...FONT_METADATA[family] })
)

export const RICH_TEXT_FONT_FAMILY_CSS = Object.freeze(
  Object.fromEntries(RICH_TEXT_FONT_CATALOG.map(({ family, css }) => [family, css])) as Record<
    RichTextFontFamily,
    string
  >
)

const CSS_TO_FONT_FAMILY = new Map(
  RICH_TEXT_FONT_CATALOG.map(({ family, css }) => [css, family] as const)
)

export function richTextFontFamilyToCss(fontFamily: RichTextFontFamily): string {
  return RICH_TEXT_FONT_FAMILY_CSS[RichTextFontFamilySchema.parse(fontFamily)]
}

export function richTextCssToFontFamily(css: string): RichTextFontFamily | undefined {
  return CSS_TO_FONT_FAMILY.get(css)
}
