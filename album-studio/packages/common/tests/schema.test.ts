import { ZodError } from 'zod'
import { describe, expect, it } from 'vitest'
import {
  ALBUM_FORMAT_UPDATED_MESSAGE,
  AlbumDocumentSchema,
  AssetRecordSchema,
  BlockTransformSchema,
  CropAreaSchema,
  DEFAULT_IMAGE_CROP,
  DEFAULT_IMAGE_EFFECTS,
  DEFAULT_IMAGE_MASK,
  DEFAULT_PAGE_SPEC,
  DecorationSchema,
  ICON_RESOURCE_IDS,
  ImageCaptionSchema,
  ImageCropSchema,
  ImageEffectsSchema,
  ImageMaskSchema,
  MAX_RICH_TEXT_CHARACTERS,
  MAX_RICH_TEXT_NODES,
  PAGE_LAYOUT_IDS,
  PAGE_LAYOUTS,
  PAGE_SPEC_PRESETS,
  PageSpecSchema,
  RichTextDocumentSchema,
  STICKER_RESOURCE_IDS,
  createAlbumDocument,
  createContentPage,
  createDecorationBlock,
  createImageBlock,
  createRichTextBlock,
  createRichTextDocument,
  listPageLayouts,
  parseAlbumDocument,
  type AssetRecord,
  type RichTextDocument
} from '../src'

const NOW = '2026-08-15T12:00:00.000Z'

function idFactory(): () => string {
  let value = 0
  return () => `id-${++value}`
}

function asset(overrides: Partial<AssetRecord> = {}): AssetRecord {
  return {
    id: 'asset-1',
    fileName: '海边.jpg',
    contentHash: 'a'.repeat(64),
    mimeType: 'image/jpeg',
    byteSize: 42,
    width: 4_000,
    height: 3_000,
    importedAt: NOW,
    ...overrides
  }
}

function albumText(text: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'album-text' as const,
    version: 1 as const,
    text,
    format: 0,
    fontFamily: 'sans' as const,
    fontSize: 18,
    color: '#201f1b',
    ...overrides
  }
}

function plainText(document: RichTextDocument): string {
  return document.root.children
    .flatMap((node) =>
      node.type === 'paragraph'
        ? node.children
        : node.children.flatMap((listItem) => listItem.children)
    )
    .map((node) => node.text)
    .join('')
}

describe('AlbumDocument v2 schema', () => {
  it('defines three strict physical page presets and defaults to A4 landscape', () => {
    expect(PAGE_SPEC_PRESETS).toEqual([
      { presetId: 'a4-landscape', widthMm: 297, heightMm: 210 },
      { presetId: 'square-12', widthMm: 304.8, heightMm: 304.8 },
      { presetId: 'widescreen-16-9', widthMm: 338.67, heightMm: 190.5 }
    ])
    expect(DEFAULT_PAGE_SPEC).toEqual(PAGE_SPEC_PRESETS[0])
    for (const pageSpec of PAGE_SPEC_PRESETS) {
      expect(PageSpecSchema.parse(pageSpec)).toEqual(pageSpec)
    }
    expect(
      PageSpecSchema.safeParse({
        presetId: 'a4-landscape',
        widthMm: 297,
        heightMm: 210,
        orientation: 'landscape'
      }).success
    ).toBe(false)
    expect(
      PageSpecSchema.safeParse({ presetId: 'square-12', widthMm: 297, heightMm: 210 }).success
    ).toBe(false)
  })

  it('creates a v2 album whose cover title, subtitle and date are ordinary blocks', () => {
    const document = createAlbumDocument({ title: ' 夏日旅行 ', now: NOW }, idFactory())

    expect(document).toMatchObject({
      schemaVersion: 2,
      revision: 0,
      title: '夏日旅行',
      pageSpec: DEFAULT_PAGE_SPEC,
      assets: []
    })
    expect(document.pages).toHaveLength(1)
    const cover = document.pages[0]
    expect(cover).toMatchObject({ kind: 'cover', layoutId: null })
    expect(cover.blocks.map((block) => block.type)).toEqual(['rich-text', 'rich-text', 'rich-text'])
    expect(
      cover.blocks.map((block) => (block.type === 'rich-text' ? plainText(block.document) : ''))
    ).toEqual(['夏日旅行', '把值得记住的时刻，装订成册。', '2026.08.15'])
    expect(AlbumDocumentSchema.parse(document)).toEqual(document)

    const square = createAlbumDocument(
      { title: '方形相册', now: NOW, pageSpec: PAGE_SPEC_PRESETS[1] },
      idFactory()
    )
    expect(square.pageSpec).toEqual(PAGE_SPEC_PRESETS[1])
  })

  it('uses a clean domain error for old versions and Zod errors for damaged v2 data', () => {
    const document = createAlbumDocument({ title: '格式校验', now: NOW }, idFactory())

    expect(() => parseAlbumDocument({ ...document, schemaVersion: 1 })).toThrow(
      ALBUM_FORMAT_UPDATED_MESSAGE
    )
    expect(() => parseAlbumDocument({ ...document, title: '' })).toThrow(ZodError)

    expect(
      AlbumDocumentSchema.safeParse({
        ...document,
        pages: [{ ...document.pages[0], hero: null }]
      }).success
    ).toBe(false)
    expect(
      AlbumDocumentSchema.safeParse({
        ...document,
        pages: [
          document.pages[0],
          {
            id: 'old-content',
            kind: 'content',
            layoutId: null,
            blocks: [],
            templateId: null,
            elements: [],
            note: { enabled: false, text: '' }
          }
        ]
      }).success
    ).toBe(false)
  })

  it('keeps assets path-free and image blocks keep crop, effects, mask and caption', () => {
    expect(AssetRecordSchema.parse(asset())).not.toHaveProperty('path')
    expect(
      AssetRecordSchema.safeParse({
        ...asset(),
        originalRelativePath: 'assets/original/a.jpg'
      }).success
    ).toBe(false)
    expect(
      AssetRecordSchema.safeParse({ ...asset(), absolutePath: '/Users/example/photo.jpg' }).success
    ).toBe(false)

    const imageBlock = createImageBlock('asset-1', undefined, idFactory())
    expect(imageBlock).toMatchObject({
      type: 'image',
      crop: DEFAULT_IMAGE_CROP,
      effects: DEFAULT_IMAGE_EFFECTS,
      mask: DEFAULT_IMAGE_MASK,
      caption: { enabled: false, text: '', placement: 'inside-bottom' }
    })
  })

  it('strictly rejects unknown transform, crop, effects, mask and caption fields', () => {
    expect(
      BlockTransformSchema.safeParse({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        rotationDeg: 0,
        scale: 2
      }).success
    ).toBe(false)
    expect(
      ImageCropSchema.safeParse({
        area: { x: 0, y: 0, width: 100, height: 100 },
        rotationDeg: 0,
        flipX: false,
        flipY: false,
        offsetX: 10
      }).success
    ).toBe(false)
    expect(
      ImageEffectsSchema.safeParse({
        brightness: 1,
        contrast: 1,
        saturation: 1,
        hueDeg: 0,
        sepia: 0,
        grayscale: 0,
        blurPx: 0,
        vignette: 0,
        beauty: 1
      }).success
    ).toBe(false)
    expect(ImageMaskSchema.safeParse({ kind: 'rounded', radius: 12 }).success).toBe(false)
    expect(
      ImageCaptionSchema.safeParse({
        enabled: false,
        text: '',
        placement: 'inside-bottom',
        style: {
          fontFamily: 'serif',
          fontSize: 13,
          color: '#201f1b',
          align: 'left',
          weight: '400',
          lineHeight: 1.6
        },
        legacyPosition: 'bottom'
      }).success
    ).toBe(false)
  })

  it('enforces normalized page geometry for every block and layout slot', () => {
    expect(
      BlockTransformSchema.safeParse({
        x: 0.8,
        y: 0.1,
        width: 0.3,
        height: 0.4,
        rotationDeg: 0
      }).success
    ).toBe(false)
    expect(CropAreaSchema.safeParse({ x: 80, y: 0, width: 30, height: 100 }).success).toBe(false)
    for (const layout of PAGE_LAYOUTS) {
      for (const slot of layout.slots) {
        expect(BlockTransformSchema.safeParse(slot.transform).success).toBe(true)
      }
    }
  })

  it('accepts only the versioned paragraph/list subset and supported text styles', () => {
    const document = {
      version: 1,
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'paragraph',
            version: 1,
            align: 'center',
            lineHeight: 1.5,
            children: [
              albumText('粗斜下划线', {
                format: 1 | 2 | 8,
                fontFamily: 'handwritten',
                fontSize: 32,
                color: '#A05B42'
              })
            ]
          },
          {
            type: 'list',
            version: 1,
            listType: 'number',
            start: 1,
            align: 'left',
            lineHeight: 1.6,
            children: [{ type: 'listitem', version: 1, value: 1, children: [albumText('第一项')] }]
          }
        ]
      }
    }

    expect(RichTextDocumentSchema.parse(document)).toEqual(document)
    expect(
      RichTextDocumentSchema.safeParse({
        ...document,
        root: { ...document.root, direction: 'ltr' }
      }).success
    ).toBe(false)
    expect(
      RichTextDocumentSchema.safeParse({
        version: 1,
        root: {
          type: 'root',
          version: 1,
          children: [
            {
              type: 'paragraph',
              version: 1,
              align: 'justify',
              lineHeight: 1.5,
              children: [albumText('非法样式', { format: 4 })]
            }
          ]
        }
      }).success
    ).toBe(false)
    expect(
      RichTextDocumentSchema.safeParse({
        version: 1,
        root: {
          type: 'root',
          version: 1,
          children: [
            {
              type: 'list',
              version: 1,
              listType: 'check',
              start: 1,
              align: 'left',
              lineHeight: 3,
              children: [{ type: 'listitem', version: 1, value: 1, children: [albumText('待办')] }]
            }
          ]
        }
      }).success
    ).toBe(false)
    expect(
      RichTextDocumentSchema.safeParse({
        version: 1,
        root: {
          type: 'root',
          version: 1,
          children: [
            {
              type: 'paragraph',
              version: 1,
              align: 'left',
              lineHeight: 1.5,
              children: [
                albumText('非法字体', { fontFamily: 'fantasy', fontSize: 7, color: '#fff' })
              ]
            }
          ]
        }
      }).success
    ).toBe(false)
  })

  it('limits rich text to 500 nodes and 20,000 total characters', () => {
    const tooManyNodes = {
      version: 1,
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'paragraph',
            version: 1,
            align: 'left',
            lineHeight: 1.5,
            children: Array.from({ length: MAX_RICH_TEXT_NODES - 1 }, () => albumText('x'))
          }
        ]
      }
    }
    expect(RichTextDocumentSchema.safeParse(tooManyNodes).success).toBe(false)

    const tooManyCharacters = {
      version: 1,
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'paragraph',
            version: 1,
            align: 'left',
            lineHeight: 1.5,
            children: [
              albumText('a'.repeat(MAX_RICH_TEXT_CHARACTERS / 2 + 1)),
              albumText('b'.repeat(MAX_RICH_TEXT_CHARACTERS / 2))
            ]
          }
        ]
      }
    }
    expect(RichTextDocumentSchema.safeParse(tooManyCharacters).success).toBe(false)
  })

  it('uses closed icon and sticker resource registries', () => {
    expect(ICON_RESOURCE_IDS).toEqual([
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
    ])
    expect(STICKER_RESOURCE_IDS).toEqual([
      'washi-tape',
      'instant-photo',
      'postage-stamp',
      'botanical-sprig',
      'starburst',
      'travel-tag'
    ])
    expect(
      DecorationSchema.parse({ kind: 'icon', resourceId: 'camera', color: '#356FC6' })
    ).toEqual({ kind: 'icon', resourceId: 'camera', color: '#356FC6' })
    expect(DecorationSchema.parse({ kind: 'sticker', resourceId: 'instant-photo' })).toEqual({
      kind: 'sticker',
      resourceId: 'instant-photo'
    })
    expect(
      DecorationSchema.safeParse({ kind: 'icon', resourceId: 'house', color: '#356FC6' }).success
    ).toBe(false)
    expect(
      DecorationSchema.safeParse({
        kind: 'sticker',
        resourceId: 'instant-photo',
        color: '#356FC6'
      }).success
    ).toBe(false)
  })

  it('validates one ordered cross-type block collection and album-wide IDs', () => {
    const ids = idFactory()
    const document = createAlbumDocument({ title: '统一 Block', now: NOW }, ids)
    document.assets.push(asset())
    const page = createContentPage(ids)
    page.blocks.push(
      createImageBlock('asset-1', undefined, ids),
      createRichTextBlock(createRichTextDocument('一段文字'), undefined, ids),
      createDecorationBlock({ kind: 'sticker', resourceId: 'travel-tag' }, undefined, ids)
    )
    document.pages.push(page)

    expect(page.blocks.map((block) => block.type)).toEqual(['image', 'rich-text', 'decoration'])
    expect(AlbumDocumentSchema.parse(document)).toEqual(document)

    const duplicateBlockId = structuredClone(document)
    duplicateBlockId.pages[1].blocks[1].id = duplicateBlockId.pages[1].blocks[0].id
    expect(AlbumDocumentSchema.safeParse(duplicateBlockId).success).toBe(false)

    const danglingAsset = structuredClone(document)
    const imageBlock = danglingAsset.pages[1].blocks[0]
    if (imageBlock.type !== 'image') throw new Error('测试夹具不是图片 Block')
    imageBlock.assetId = 'missing'
    expect(AlbumDocumentSchema.safeParse(danglingAsset).success).toBe(false)

    const duplicateAsset = structuredClone(document)
    duplicateAsset.assets.push(asset({ id: 'asset-2' }))
    expect(AlbumDocumentSchema.safeParse(duplicateAsset).success).toBe(false)
  })

  it('registers seven image layouts and three content-only mixed layouts', () => {
    expect(PAGE_LAYOUTS.map((layout) => layout.id)).toEqual(PAGE_LAYOUT_IDS)
    expect(PAGE_LAYOUTS).toHaveLength(10)
    for (const layout of PAGE_LAYOUTS) {
      expect(layout.supportedPageKinds).toEqual(['content'])
    }
    for (const layout of PAGE_LAYOUTS.slice(0, 7)) {
      expect(layout.slots.every((slot) => slot.accepts === 'image')).toBe(true)
    }
    expect(
      PAGE_LAYOUTS.slice(7).map((layout) => ({
        id: layout.id,
        imageCount: layout.slots.filter((slot) => slot.accepts === 'image').length,
        richTextCount: layout.slots.filter((slot) => slot.accepts === 'rich-text').length
      }))
    ).toEqual([
      { id: 'image-text-focus', imageCount: 1, richTextCount: 1 },
      { id: 'two-image-story', imageCount: 2, richTextCount: 1 },
      { id: 'three-image-note', imageCount: 3, richTextCount: 1 }
    ])
    expect(listPageLayouts({ imageCount: 1, richTextCount: 1 }).map((layout) => layout.id)).toEqual(
      ['image-text-focus']
    )
  })

  it('only accepts layoutId when typed block geometry exactly matches its slots', () => {
    const ids = idFactory()
    const document = createAlbumDocument({ title: '混合布局', now: NOW }, ids)
    document.assets.push(asset())
    const layout = PAGE_LAYOUTS.find((candidate) => candidate.id === 'image-text-focus')
    if (!layout) throw new Error('缺少混合布局测试夹具')
    const imageSlot = layout.slots.find((slot) => slot.accepts === 'image')
    const textSlot = layout.slots.find((slot) => slot.accepts === 'rich-text')
    if (!imageSlot || !textSlot) throw new Error('混合布局槽位不完整')

    const page = createContentPage(ids)
    page.layoutId = layout.id
    page.blocks.push(
      createImageBlock('asset-1', imageSlot.transform, ids),
      createDecorationBlock(
        { kind: 'icon', resourceId: 'heart', color: '#A05B42' },
        undefined,
        ids
      ),
      createRichTextBlock(createRichTextDocument('故事'), textSlot.transform, ids)
    )
    document.pages.push(page)
    expect(AlbumDocumentSchema.parse(document)).toEqual(document)

    const wrongGeometry = structuredClone(document)
    wrongGeometry.pages[1].blocks[0].transform.x += 0.01
    expect(AlbumDocumentSchema.safeParse(wrongGeometry).success).toBe(false)

    const coverLayout = structuredClone(document)
    coverLayout.pages[0].layoutId = 'focus'
    expect(AlbumDocumentSchema.safeParse(coverLayout).success).toBe(false)
  })
})
