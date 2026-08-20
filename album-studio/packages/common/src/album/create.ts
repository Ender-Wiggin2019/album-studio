import {
  AlbumDocumentSchema,
  DecorationSchema,
  DEFAULT_PAGE_SPEC,
  RichTextDocumentSchema,
  type AlbumDocument,
  type BlockTransform,
  type ContentPage,
  type Decoration,
  type DecorationBlock,
  type ImageBlock,
  type ImageCaption,
  type ImageCrop,
  type ImageEffects,
  type ImageMask,
  type PageSpec,
  type RichTextAlignment,
  type RichTextBlock,
  type RichTextDocument,
  type RichTextFontFamily,
  type RichTextFormat,
  type TextStyle,
  type ThemeId
} from './schema'

export type IdFactory = () => string

const defaultIdFactory: IdFactory = () => crypto.randomUUID()

export const DEFAULT_IMAGE_BLOCK_TRANSFORM: Readonly<BlockTransform> = Object.freeze({
  x: 0.1,
  y: 0.12,
  width: 0.42,
  height: 0.55,
  rotationDeg: 0
})

export const DEFAULT_RICH_TEXT_BLOCK_TRANSFORM: Readonly<BlockTransform> = Object.freeze({
  x: 0.25,
  y: 0.36,
  width: 0.5,
  height: 0.28,
  rotationDeg: 0
})

export const DEFAULT_DECORATION_BLOCK_TRANSFORM: Readonly<BlockTransform> = Object.freeze({
  x: 0.42,
  y: 0.38,
  width: 0.16,
  height: 0.24,
  rotationDeg: 0
})

export type ImagePixelSize = Readonly<{ width: number; height: number }>

/**
 * 按原图宽高比计算画布 Block 尺寸：把照片完整放进一个最大框内（contain），
 * 不裁剪、不拉伸。transform 是页面归一化坐标，视觉比例需要乘上页面宽高比。
 */
export function fitImageBlockSize(input: {
  assetWidth: number
  assetHeight: number
  pageWidthMm: number
  pageHeightMm: number
  maxWidth?: number
  maxHeight?: number
}): ImagePixelSize {
  const maxWidth = input.maxWidth ?? DEFAULT_IMAGE_BLOCK_TRANSFORM.width
  const maxHeight = input.maxHeight ?? DEFAULT_IMAGE_BLOCK_TRANSFORM.height
  if (
    input.assetWidth <= 0 ||
    input.assetHeight <= 0 ||
    input.pageWidthMm <= 0 ||
    input.pageHeightMm <= 0
  ) {
    throw new Error('图片与页面尺寸必须为正数。')
  }
  const ratio = (input.assetWidth / input.assetHeight) * (input.pageHeightMm / input.pageWidthMm)
  if (ratio >= maxWidth / maxHeight) {
    return { width: maxWidth, height: maxWidth / ratio }
  }
  return { width: maxHeight * ratio, height: maxHeight }
}

/**
 * 把一组照片按原图比例排成两列流式布局（先放较矮的列），
 * 全部放入页面后再统一等比缩小，保证不重叠、不越界、比例不变。
 * 返回按输入顺序对应的 BlockTransform。
 */
export function arrangeImageBlocksFree(input: {
  photos: readonly Readonly<ImagePixelSize>[]
  pageWidthMm: number
  pageHeightMm: number
}): readonly Readonly<BlockTransform>[] {
  const MARGIN_X = 0.07
  const MARGIN_Y = 0.07
  const GAP_X = 0.05
  const GAP_Y = 0.045
  const columnWidth = (1 - 2 * MARGIN_X - GAP_X) / 2
  const columnXs = [MARGIN_X, MARGIN_X + columnWidth + GAP_X]

  const columnOf: number[] = []
  const naturalHeights: number[] = []
  const columnYs = [MARGIN_Y, MARGIN_Y]
  let maxBottom = MARGIN_Y

  for (const photo of input.photos) {
    const ratio = (photo.width / photo.height) * (input.pageHeightMm / input.pageWidthMm)
    const height = columnWidth / ratio
    const column = columnYs[0] <= columnYs[1] ? 0 : 1
    columnOf.push(column)
    naturalHeights.push(height)
    columnYs[column] += height + GAP_Y
    maxBottom = Math.max(maxBottom, columnYs[column] - GAP_Y)
  }

  const scale = maxBottom > 1 ? 1 / maxBottom : 1
  const cursorYs = [MARGIN_Y, MARGIN_Y]
  return input.photos.map((_, index) => {
    const column = columnOf[index]
    const x = columnXs[column] * scale
    const y = cursorYs[column] * scale
    const width = columnWidth * scale
    const height = naturalHeights[index] * scale
    cursorYs[column] += naturalHeights[index] + GAP_Y
    return { x, y, width, height, rotationDeg: 0 }
  })
}

export const DEFAULT_IMAGE_CROP: Readonly<ImageCrop> = Object.freeze({
  area: Object.freeze({ x: 0, y: 0, width: 100, height: 100 }),
  rotationDeg: 0,
  flipX: false,
  flipY: false
})

export const DEFAULT_IMAGE_EFFECTS: Readonly<ImageEffects> = Object.freeze({
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hueDeg: 0,
  sepia: 0,
  grayscale: 0,
  blurPx: 0,
  vignette: 0,
  beautySmooth: 0,
  beautyWhiten: 0,
  clarity: 0
})

export const DEFAULT_IMAGE_MASK: Readonly<ImageMask> = Object.freeze({
  kind: 'rectangle'
})

export const DEFAULT_CAPTION_STYLE: Readonly<TextStyle> = Object.freeze({
  fontFamily: 'serif',
  fontSize: 13,
  color: '#201f1b',
  align: 'left',
  weight: '400',
  lineHeight: 1.6
})

export type RichTextDocumentOptions = Readonly<{
  fontFamily?: RichTextFontFamily
  fontSize?: number
  color?: string
  format?: RichTextFormat
  align?: RichTextAlignment
  lineHeight?: number
}>

function cloneTransform(transform: Readonly<BlockTransform>): BlockTransform {
  return { ...transform }
}

function createDefaultCrop(): ImageCrop {
  return { ...DEFAULT_IMAGE_CROP, area: { ...DEFAULT_IMAGE_CROP.area } }
}

function createDefaultEffects(): ImageEffects {
  return { ...DEFAULT_IMAGE_EFFECTS }
}

function createDefaultMask(): ImageMask {
  return { ...DEFAULT_IMAGE_MASK }
}

function createDefaultCaption(): ImageCaption {
  return {
    enabled: false,
    text: '',
    placement: 'inside-bottom',
    style: { ...DEFAULT_CAPTION_STYLE }
  }
}

export function createRichTextDocument(
  text = '',
  options: RichTextDocumentOptions = {}
): RichTextDocument {
  return RichTextDocumentSchema.parse({
    version: 1,
    root: {
      type: 'root',
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          align: options.align ?? 'left',
          lineHeight: options.lineHeight ?? 1.5,
          children: text
            ? [
                {
                  type: 'album-text',
                  version: 1,
                  text,
                  format: options.format ?? 0,
                  fontFamily: options.fontFamily ?? 'sans',
                  fontSize: options.fontSize ?? 18,
                  color: options.color ?? '#201f1b'
                }
              ]
            : []
        }
      ]
    }
  })
}

export function createImageBlock(
  assetId: string,
  transform: Readonly<BlockTransform> = DEFAULT_IMAGE_BLOCK_TRANSFORM,
  idFactory: IdFactory = defaultIdFactory
): ImageBlock {
  return {
    id: idFactory(),
    type: 'image',
    assetId,
    transform: cloneTransform(transform),
    crop: createDefaultCrop(),
    effects: createDefaultEffects(),
    mask: createDefaultMask(),
    caption: createDefaultCaption()
  }
}

export function createRichTextBlock(
  document: RichTextDocument,
  transform: Readonly<BlockTransform> = DEFAULT_RICH_TEXT_BLOCK_TRANSFORM,
  idFactory: IdFactory = defaultIdFactory
): RichTextBlock {
  return {
    id: idFactory(),
    type: 'rich-text',
    transform: cloneTransform(transform),
    writingMode: 'horizontal',
    document: RichTextDocumentSchema.parse(document)
  }
}

export function createDecorationBlock(
  decoration: Decoration,
  transform: Readonly<BlockTransform> = DEFAULT_DECORATION_BLOCK_TRANSFORM,
  idFactory: IdFactory = defaultIdFactory
): DecorationBlock {
  return {
    id: idFactory(),
    type: 'decoration',
    transform: cloneTransform(transform),
    decoration: DecorationSchema.parse(decoration)
  }
}

export function createContentPage(idFactory: IdFactory = defaultIdFactory): ContentPage {
  return {
    id: idFactory(),
    kind: 'content',
    layoutId: null,
    blocks: []
  }
}

const COVER_TITLE_TRANSFORM = Object.freeze({
  x: 0.11,
  y: 0.6,
  width: 0.54,
  height: 0.15,
  rotationDeg: 0
} satisfies BlockTransform)

const COVER_SUBTITLE_TRANSFORM = Object.freeze({
  x: 0.11,
  y: 0.8,
  width: 0.54,
  height: 0.07,
  rotationDeg: 0
} satisfies BlockTransform)

const COVER_DATE_TRANSFORM = Object.freeze({
  x: 0.11,
  y: 0.51,
  width: 0.32,
  height: 0.05,
  rotationDeg: 0
} satisfies BlockTransform)

function formatCoverDate(now: string): string {
  return now.slice(0, 10).replaceAll('-', '.')
}

export function createAlbumDocument(
  input: { title: string; themeId?: ThemeId; pageSpec?: PageSpec; now?: string },
  idFactory: IdFactory = defaultIdFactory
): AlbumDocument {
  const now = input.now ?? new Date().toISOString()
  const title = input.title.trim() || '未命名相册'
  return AlbumDocumentSchema.parse({
    schemaVersion: 2,
    id: idFactory(),
    revision: 0,
    title,
    createdAt: now,
    updatedAt: now,
    themeId: input.themeId ?? 'journal',
    pageSpec: { ...(input.pageSpec ?? DEFAULT_PAGE_SPEC) },
    recentColors: [],
    assets: [],
    pages: [
      {
        id: idFactory(),
        kind: 'cover',
        layoutId: null,
        blocks: [
          createRichTextBlock(
            createRichTextDocument(title, {
              fontFamily: 'serif',
              fontSize: 64,
              color: '#201f1b',
              format: 1,
              lineHeight: 1.05
            }),
            COVER_TITLE_TRANSFORM,
            idFactory
          ),
          createRichTextBlock(
            createRichTextDocument('把值得记住的时刻，装订成册。', {
              fontFamily: 'serif',
              fontSize: 18,
              color: '#6f6a61',
              lineHeight: 1.5
            }),
            COVER_SUBTITLE_TRANSFORM,
            idFactory
          ),
          createRichTextBlock(
            createRichTextDocument(formatCoverDate(now), {
              fontFamily: 'mono',
              fontSize: 14,
              color: '#9a5a3a',
              lineHeight: 1.3
            }),
            COVER_DATE_TRANSFORM,
            idFactory
          )
        ]
      }
    ]
  })
}
