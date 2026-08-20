import { z } from 'zod'
import { FREE_FORM_LAYOUT_ID, getPageLayout } from './layouts'

export const ALBUM_DOCUMENT_SCHEMA_VERSION = 2 as const
export const ALBUM_FORMAT_UPDATED_MESSAGE = '项目格式已更新，请新建项目' as const
export const IMAGE_PIPELINE_VERSION = '1' as const

export const THEME_IDS = ['journal', 'postcard', 'film'] as const
export const ThemeIdSchema = z.enum(THEME_IDS)
export type ThemeId = z.infer<typeof ThemeIdSchema>

export const PAGE_LAYOUT_IDS = [
  'focus',
  'split-even',
  'editorial-three',
  'triptych',
  'grid-four',
  'mosaic-five',
  'contact-six',
  'image-text-focus',
  'two-image-story',
  'three-image-note',
  'free-form'
] as const
export const PageLayoutIdSchema = z.enum(PAGE_LAYOUT_IDS)
export type PageLayoutId = z.infer<typeof PageLayoutIdSchema>

export const PAGE_SPEC_PRESETS = Object.freeze([
  Object.freeze({ presetId: 'a4-landscape', widthMm: 297, heightMm: 210 }),
  Object.freeze({ presetId: 'a4-portrait', widthMm: 210, heightMm: 297 }),
  Object.freeze({ presetId: 'square-12', widthMm: 304.8, heightMm: 304.8 }),
  Object.freeze({ presetId: 'widescreen-16-9', widthMm: 338.67, heightMm: 190.5 })
] as const)

export const DEFAULT_PAGE_SPEC = PAGE_SPEC_PRESETS[0]

export const PageSpecSchema = z.discriminatedUnion('presetId', [
  z
    .object({
      presetId: z.literal('a4-landscape'),
      widthMm: z.literal(297),
      heightMm: z.literal(210)
    })
    .strict(),
  z
    .object({
      presetId: z.literal('a4-portrait'),
      widthMm: z.literal(210),
      heightMm: z.literal(297)
    })
    .strict(),
  z
    .object({
      presetId: z.literal('square-12'),
      widthMm: z.literal(304.8),
      heightMm: z.literal(304.8)
    })
    .strict(),
  z
    .object({
      presetId: z.literal('widescreen-16-9'),
      widthMm: z.literal(338.67),
      heightMm: z.literal(190.5)
    })
    .strict()
])
export type PageSpec = z.infer<typeof PageSpecSchema>

const finiteNumber = z.number().finite()
const normalizedCoordinate = finiteNumber.min(0).max(1)
const normalizedLength = finiteNumber.gt(0).max(1)
const percentageCoordinate = finiteNumber.min(0).max(100)
const percentageLength = finiteNumber.gt(0).max(100)

export function transformsEqual(left: BlockTransform, right: Readonly<BlockTransform>): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.rotationDeg === right.rotationDeg
  )
}

export const BlockTransformSchema = z
  .object({
    x: normalizedCoordinate,
    y: normalizedCoordinate,
    width: normalizedLength,
    height: normalizedLength,
    rotationDeg: finiteNumber.min(-180).max(180)
  })
  .strict()
  .superRefine((transform, context) => {
    if (transform.x + transform.width > 1 + Number.EPSILON) {
      context.addIssue({
        code: 'custom',
        message: 'Block 不能超出页面右侧',
        path: ['width']
      })
    }
    if (transform.y + transform.height > 1 + Number.EPSILON) {
      context.addIssue({
        code: 'custom',
        message: 'Block 不能超出页面底部',
        path: ['height']
      })
    }
  })
export type BlockTransform = z.infer<typeof BlockTransformSchema>

export const CropAreaSchema = z
  .object({
    x: percentageCoordinate,
    y: percentageCoordinate,
    width: percentageLength,
    height: percentageLength
  })
  .strict()
  .superRefine((area, context) => {
    if (area.x + area.width > 100 + Number.EPSILON) {
      context.addIssue({
        code: 'custom',
        message: '裁剪区域不能超出原图右侧',
        path: ['width']
      })
    }
    if (area.y + area.height > 100 + Number.EPSILON) {
      context.addIssue({
        code: 'custom',
        message: '裁剪区域不能超出原图底部',
        path: ['height']
      })
    }
  })
export type CropArea = z.infer<typeof CropAreaSchema>

export const ImageCropSchema = z
  .object({
    area: CropAreaSchema,
    rotationDeg: finiteNumber.min(-180).max(180),
    flipX: z.boolean(),
    flipY: z.boolean()
  })
  .strict()
export type ImageCrop = z.infer<typeof ImageCropSchema>

export const ImageEffectsSchema = z
  .object({
    brightness: finiteNumber.min(0).max(2),
    contrast: finiteNumber.min(0).max(2),
    saturation: finiteNumber.min(0).max(2),
    hueDeg: finiteNumber.min(-180).max(180),
    sepia: finiteNumber.min(0).max(1),
    grayscale: finiteNumber.min(0).max(1),
    blurPx: finiteNumber.min(0).max(20),
    vignette: finiteNumber.min(0).max(1),
    // 后加的滤镜参数必须带默认值，否则旧项目 manifest（无该字段）会被严格校验拒绝
    beautySmooth: finiteNumber.min(0).max(1).default(0),
    beautyWhiten: finiteNumber.min(0).max(1).default(0),
    clarity: finiteNumber.min(0).max(1).default(0)
  })
  .strict()
export type ImageEffects = z.infer<typeof ImageEffectsSchema>

export const MASK_KINDS = [
  'rectangle',
  'rounded',
  'circle',
  'arch',
  'paper-edge',
  'postage',
  'film-frame'
] as const
export const ImageMaskSchema = z
  .object({
    kind: z.enum(MASK_KINDS)
  })
  .strict()
export type ImageMask = z.infer<typeof ImageMaskSchema>

export const ERASE_STROKE_MODES = ['add', 'subtract'] as const

export const ErasePointSchema = z
  .object({ x: normalizedCoordinate, y: normalizedCoordinate })
  .strict()
export type ErasePoint = z.infer<typeof ErasePointSchema>

export const EraseStrokeSchema = z
  .object({
    mode: z.enum(ERASE_STROKE_MODES),
    /** 笔刷直径占图片宽度的比例。 */
    size: normalizedLength,
    points: z.array(ErasePointSchema).min(2).max(2000)
  })
  .strict()
export type EraseStroke = z.infer<typeof EraseStrokeSchema>

/**
 * 消除（AI 修补）参数，只保存参数不保存位图；
 * 最终遮罩 = 自动识别遮罩（autoDetect）∪ 笔划（add 叠加 / subtract 抠除），可完全由参数重建。
 */
export const ImageEraseSchema = z
  .object({
    autoDetect: z.boolean(),
    strokes: z.array(EraseStrokeSchema).max(200)
  })
  .strict()
export type ImageErase = z.infer<typeof ImageEraseSchema>

export const HexColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i)
export type HexColor = z.infer<typeof HexColorSchema>

export const MAX_RECENT_COLORS = 8
const CanonicalHexColorSchema = HexColorSchema.transform((color) => color.toLowerCase())
export const RecentColorsSchema = z
  .array(CanonicalHexColorSchema)
  .max(MAX_RECENT_COLORS)
  .superRefine((colors, context) => {
    if (new Set(colors).size !== colors.length) {
      context.addIssue({ code: 'custom', message: '项目颜色不能重复' })
    }
  })
  .default([])

export const RICH_TEXT_FONT_FAMILIES = [
  'smiley-sans',
  'lxgw-wenkai',
  'lxgw-marker',
  'xiaolai',
  'serif',
  'sans',
  'handwritten',
  'mono'
] as const
export const RichTextFontFamilySchema = z.enum(RICH_TEXT_FONT_FAMILIES)
export type RichTextFontFamily = z.infer<typeof RichTextFontFamilySchema>

export const RICH_TEXT_ALIGNMENTS = ['left', 'center', 'right'] as const
export const RichTextAlignmentSchema = z.enum(RICH_TEXT_ALIGNMENTS)
export type RichTextAlignment = z.infer<typeof RichTextAlignmentSchema>

export const RICH_TEXT_WRITING_MODES = ['horizontal', 'vertical'] as const
export const RichTextWritingModeSchema = z.enum(RICH_TEXT_WRITING_MODES)
export type RichTextWritingMode = z.infer<typeof RichTextWritingModeSchema>

export const RICH_TEXT_FORMAT_BITS = Object.freeze({
  bold: 1,
  italic: 2,
  underline: 8
} as const)
const RICH_TEXT_ALLOWED_FORMAT_MASK =
  RICH_TEXT_FORMAT_BITS.bold | RICH_TEXT_FORMAT_BITS.italic | RICH_TEXT_FORMAT_BITS.underline

export const RichTextFormatSchema = z
  .number()
  .int()
  .min(0)
  .max(RICH_TEXT_ALLOWED_FORMAT_MASK)
  .refine((format) => (format & ~RICH_TEXT_ALLOWED_FORMAT_MASK) === 0, {
    message: '文字只支持粗体、斜体和下划线'
  })
export type RichTextFormat = z.infer<typeof RichTextFormatSchema>

export const MAX_RICH_TEXT_NODES = 500
export const MAX_RICH_TEXT_CHARACTERS = 20_000

export const AlbumTextNodeSchema = z
  .object({
    type: z.literal('album-text'),
    version: z.literal(1),
    text: z.string().max(MAX_RICH_TEXT_CHARACTERS),
    format: RichTextFormatSchema,
    fontFamily: RichTextFontFamilySchema,
    fontSize: finiteNumber.min(8).max(120),
    color: HexColorSchema
  })
  .strict()
export type AlbumTextNode = z.infer<typeof AlbumTextNodeSchema>

export const RichTextParagraphNodeSchema = z
  .object({
    type: z.literal('paragraph'),
    version: z.literal(1),
    align: RichTextAlignmentSchema,
    lineHeight: finiteNumber.min(1).max(2.5),
    children: z.array(AlbumTextNodeSchema).max(MAX_RICH_TEXT_NODES)
  })
  .strict()
export type RichTextParagraphNode = z.infer<typeof RichTextParagraphNodeSchema>

export const RichTextListItemNodeSchema = z
  .object({
    type: z.literal('listitem'),
    version: z.literal(1),
    value: z.number().int().positive(),
    children: z.array(AlbumTextNodeSchema).max(MAX_RICH_TEXT_NODES)
  })
  .strict()
export type RichTextListItemNode = z.infer<typeof RichTextListItemNodeSchema>

export const RichTextListNodeSchema = z
  .object({
    type: z.literal('list'),
    version: z.literal(1),
    listType: z.enum(['bullet', 'number']),
    start: z.number().int().positive(),
    align: RichTextAlignmentSchema,
    lineHeight: finiteNumber.min(1).max(2.5),
    children: z.array(RichTextListItemNodeSchema).min(1).max(MAX_RICH_TEXT_NODES)
  })
  .strict()
export type RichTextListNode = z.infer<typeof RichTextListNodeSchema>

export const RichTextRootNodeSchema = z
  .object({
    type: z.literal('root'),
    version: z.literal(1),
    children: z
      .array(z.discriminatedUnion('type', [RichTextParagraphNodeSchema, RichTextListNodeSchema]))
      .min(1)
      .max(MAX_RICH_TEXT_NODES)
  })
  .strict()
export type RichTextRootNode = z.infer<typeof RichTextRootNodeSchema>

export const RichTextDocumentSchema = z
  .object({
    version: z.literal(1),
    root: RichTextRootNodeSchema
  })
  .strict()
  .superRefine((document, context) => {
    let nodeCount = 1
    let characterCount = 0

    for (const node of document.root.children) {
      nodeCount += 1
      if (node.type === 'paragraph') {
        nodeCount += node.children.length
        characterCount += node.children.reduce((total, child) => total + child.text.length, 0)
        continue
      }

      for (const item of node.children) {
        nodeCount += 1 + item.children.length
        characterCount += item.children.reduce((total, child) => total + child.text.length, 0)
      }
    }

    if (nodeCount > MAX_RICH_TEXT_NODES) {
      context.addIssue({
        code: 'custom',
        message: `富文本最多包含 ${MAX_RICH_TEXT_NODES} 个节点`,
        path: ['root']
      })
    }
    if (characterCount > MAX_RICH_TEXT_CHARACTERS) {
      context.addIssue({
        code: 'custom',
        message: `富文本最多包含 ${MAX_RICH_TEXT_CHARACTERS} 个字符`,
        path: ['root']
      })
    }
  })
export type RichTextDocument = z.infer<typeof RichTextDocumentSchema>

export const TextStyleSchema = z
  .object({
    fontFamily: RichTextFontFamilySchema,
    fontSize: finiteNumber.min(8).max(120),
    color: HexColorSchema,
    align: RichTextAlignmentSchema,
    weight: z.enum(['400', '500', '600', '700']),
    lineHeight: finiteNumber.min(1).max(2.5)
  })
  .strict()
export type TextStyle = z.infer<typeof TextStyleSchema>

export const ImageCaptionSchema = z
  .object({
    enabled: z.boolean(),
    text: z.string().max(500),
    placement: z.enum(['inside-bottom', 'below']),
    style: TextStyleSchema
  })
  .strict()
export type ImageCaption = z.infer<typeof ImageCaptionSchema>

const BlockBaseShape = {
  id: z.string().min(1),
  transform: BlockTransformSchema
} as const

export const BlockBaseSchema = z.object(BlockBaseShape).strict()
export type BlockBase = z.infer<typeof BlockBaseSchema>

export const ImageBlockSchema = z
  .object({
    ...BlockBaseShape,
    type: z.literal('image'),
    assetId: z.string().min(1),
    crop: ImageCropSchema,
    effects: ImageEffectsSchema,
    mask: ImageMaskSchema,
    caption: ImageCaptionSchema,
    erase: ImageEraseSchema.optional()
  })
  .strict()
export type ImageBlock = z.infer<typeof ImageBlockSchema>

export const RichTextBlockSchema = z
  .object({
    ...BlockBaseShape,
    type: z.literal('rich-text'),
    writingMode: RichTextWritingModeSchema.default('horizontal'),
    document: RichTextDocumentSchema
  })
  .strict()
export type RichTextBlock = z.infer<typeof RichTextBlockSchema>

export const ICON_RESOURCE_IDS = [
  'heart',
  'star',
  'camera',
  'map-pin',
  'plane',
  'gift',
  'cake',
  'calendar-days',
  'music',
  'flower-2',
  'paw-print',
  'sparkles'
] as const
export const IconResourceIdSchema = z.enum(ICON_RESOURCE_IDS)
export type IconResourceId = z.infer<typeof IconResourceIdSchema>

export const STICKER_RESOURCE_IDS = [
  'washi-tape',
  'instant-photo',
  'postage-stamp',
  'botanical-sprig',
  'starburst',
  'travel-tag'
] as const
export const StickerResourceIdSchema = z.enum(STICKER_RESOURCE_IDS)
export type StickerResourceId = z.infer<typeof StickerResourceIdSchema>

export const IconDecorationSchema = z
  .object({
    kind: z.literal('icon'),
    resourceId: IconResourceIdSchema,
    color: HexColorSchema
  })
  .strict()
export type IconDecoration = z.infer<typeof IconDecorationSchema>

export const StickerDecorationSchema = z
  .object({
    kind: z.literal('sticker'),
    resourceId: StickerResourceIdSchema
  })
  .strict()
export type StickerDecoration = z.infer<typeof StickerDecorationSchema>

export const DecorationSchema = z.discriminatedUnion('kind', [
  IconDecorationSchema,
  StickerDecorationSchema
])
export type Decoration = z.infer<typeof DecorationSchema>

export const DecorationBlockSchema = z
  .object({
    ...BlockBaseShape,
    type: z.literal('decoration'),
    decoration: DecorationSchema
  })
  .strict()
export type DecorationBlock = z.infer<typeof DecorationBlockSchema>

export const BlockSchema = z.discriminatedUnion('type', [
  ImageBlockSchema,
  RichTextBlockSchema,
  DecorationBlockSchema
])
export type Block = z.infer<typeof BlockSchema>

export const ALBUM_PAGE_KINDS = ['cover', 'content'] as const
export const AlbumPageKindSchema = z.enum(ALBUM_PAGE_KINDS)
export type AlbumPageKind = z.infer<typeof AlbumPageKindSchema>

const PageBaseShape = {
  id: z.string().min(1),
  layoutId: PageLayoutIdSchema.nullable(),
  blocks: z.array(BlockSchema).max(100)
} as const

export const CoverPageSchema = z
  .object({
    ...PageBaseShape,
    kind: z.literal('cover')
  })
  .strict()
export type CoverPage = z.infer<typeof CoverPageSchema>

export const ContentPageSchema = z
  .object({
    ...PageBaseShape,
    kind: z.literal('content')
  })
  .strict()
export type ContentPage = z.infer<typeof ContentPageSchema>

export const AlbumPageSchema = z.discriminatedUnion('kind', [CoverPageSchema, ContentPageSchema])
export type AlbumPage = z.infer<typeof AlbumPageSchema>

export const AssetRecordSchema = z
  .object({
    id: z.string().min(1),
    fileName: z.string().min(1).max(255),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
    byteSize: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    importedAt: z.string().datetime()
  })
  .strict()
export type AssetRecord = z.infer<typeof AssetRecordSchema>

export const AlbumDocumentSchema = z
  .object({
    schemaVersion: z.literal(ALBUM_DOCUMENT_SCHEMA_VERSION),
    id: z.string().min(1),
    revision: z.number().int().nonnegative(),
    title: z.string().min(1).max(160),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    themeId: ThemeIdSchema,
    pageSpec: PageSpecSchema,
    recentColors: RecentColorsSchema,
    assets: z.array(AssetRecordSchema),
    pages: z.array(AlbumPageSchema).min(1)
  })
  .strict()
  .superRefine((document, context) => {
    if (document.pages[0]?.kind !== 'cover') {
      context.addIssue({
        code: 'custom',
        message: '相册第一页必须是封面',
        path: ['pages', 0]
      })
    }

    const assetIds = new Set<string>()
    const contentHashes = new Set<string>()
    for (const [assetIndex, asset] of document.assets.entries()) {
      if (assetIds.has(asset.id)) {
        context.addIssue({
          code: 'custom',
          message: '素材 ID 必须唯一',
          path: ['assets', assetIndex, 'id']
        })
      }
      if (contentHashes.has(asset.contentHash)) {
        context.addIssue({
          code: 'custom',
          message: '相同内容的素材只能保存一份',
          path: ['assets', assetIndex, 'contentHash']
        })
      }
      assetIds.add(asset.id)
      contentHashes.add(asset.contentHash)
    }

    const pageIds = new Set<string>()
    const blockIds = new Set<string>()
    for (const [pageIndex, page] of document.pages.entries()) {
      if (pageIds.has(page.id)) {
        context.addIssue({
          code: 'custom',
          message: '页面 ID 必须唯一',
          path: ['pages', pageIndex, 'id']
        })
      }
      pageIds.add(page.id)

      if (pageIndex > 0 && page.kind === 'cover') {
        context.addIssue({
          code: 'custom',
          message: '相册只能有一个封面',
          path: ['pages', pageIndex, 'kind']
        })
      }

      for (const [blockIndex, block] of page.blocks.entries()) {
        const blockPath = ['pages', pageIndex, 'blocks', blockIndex]
        if (blockIds.has(block.id)) {
          context.addIssue({
            code: 'custom',
            message: 'Block ID 必须在整册内唯一',
            path: [...blockPath, 'id']
          })
        }
        blockIds.add(block.id)

        if (block.type === 'image' && !assetIds.has(block.assetId)) {
          context.addIssue({
            code: 'custom',
            message: '图片 Block 引用了不存在的素材',
            path: [...blockPath, 'assetId']
          })
        }
      }

      if (page.layoutId && page.layoutId !== FREE_FORM_LAYOUT_ID) {
        const layout = getPageLayout(page.layoutId)
        const imageBlocks = page.blocks.filter((block) => block.type === 'image')
        const richTextBlocks = page.blocks.filter((block) => block.type === 'rich-text')
        const imageSlots = layout.slots.filter((slot) => slot.accepts === 'image')
        const richTextSlots = layout.slots.filter((slot) => slot.accepts === 'rich-text')
        const pageKindSupported = layout.supportedPageKinds.includes(page.kind)
        const matchesImageSlots =
          imageBlocks.length === imageSlots.length &&
          imageBlocks.every((block, index) =>
            transformsEqual(block.transform, imageSlots[index].transform)
          )
        const matchesRichTextSlots =
          richTextBlocks.length === richTextSlots.length &&
          richTextBlocks.every((block, index) =>
            transformsEqual(block.transform, richTextSlots[index].transform)
          )

        if (!pageKindSupported || !matchesImageSlots || !matchesRichTextSlots) {
          context.addIssue({
            code: 'custom',
            message: '页面布局标识与当前 Block 类型或几何不一致',
            path: ['pages', pageIndex, 'layoutId']
          })
        }
      }
    }
  })

export type AlbumDocument = z.infer<typeof AlbumDocumentSchema>

function hasSchemaVersion(input: unknown): input is { schemaVersion: unknown } {
  return typeof input === 'object' && input !== null && 'schemaVersion' in input
}

export function parseAlbumDocument(input: unknown): AlbumDocument {
  if (hasSchemaVersion(input) && input.schemaVersion !== ALBUM_DOCUMENT_SCHEMA_VERSION) {
    throw new Error(ALBUM_FORMAT_UPDATED_MESSAGE)
  }
  return AlbumDocumentSchema.parse(input)
}
