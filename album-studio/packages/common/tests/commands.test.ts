import { describe, expect, it } from 'vitest'
import {
  AlbumCommandError,
  AlbumCommandSchema,
  AlbumDocumentSchema,
  applyAlbumPatches,
  applyImageEffectPreset,
  createAlbumDocument,
  createRichTextDocument,
  executeAlbumCommand,
  executeAlbumCommands,
  getPageLayout,
  type AlbumCommand,
  type AlbumCommandResult,
  type AlbumDocument,
  type AssetRecord,
  type ContentPage
} from '../src'

const NOW = '2026-08-15T12:00:00.000Z'

function idFactory(): () => string {
  let value = 0
  return () => `id-${++value}`
}

function assets(count: number): AssetRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `asset-${index + 1}`,
    fileName: `${index + 1}.jpg`,
    contentHash: (index + 1).toString(16).padStart(64, '0'),
    mimeType: 'image/jpeg' as const,
    byteSize: index + 1,
    width: 4_000,
    height: 3_000,
    importedAt: NOW
  }))
}

function run(
  document: AlbumDocument,
  command: AlbumCommand,
  ids: () => string,
  minute = 1
): AlbumCommandResult {
  return executeAlbumCommand(document, command, {
    idFactory: ids,
    now: `2026-08-15T12:${String(minute).padStart(2, '0')}:00.000Z`
  })
}

function seededDocument(count = 3): {
  document: AlbumDocument
  ids: () => string
} {
  const ids = idFactory()
  const document = createAlbumDocument({ title: '测试相册', now: NOW }, ids)
  return {
    document:
      count === 0
        ? document
        : run(document, { type: 'register-assets', assets: assets(count) }, ids).document,
    ids
  }
}

function contentPage(document: AlbumDocument): ContentPage {
  const page = document.pages.find(
    (candidate): candidate is ContentPage => candidate.kind === 'content'
  )
  if (!page) throw new Error('expected content page')
  return page
}

describe('AlbumDocument command interface', () => {
  it('commits a multi-command user intent as one revision and patch group', () => {
    const ids = idFactory()
    const document = createAlbumDocument({ title: '批量命令', now: NOW }, ids)
    const result = executeAlbumCommands(
      document,
      [
        { type: 'register-assets', assets: assets(1) },
        { type: 'add-page', assetIds: ['asset-1'], layoutId: 'focus' }
      ],
      { idFactory: ids, now: '2026-08-15T12:01:00.000Z' }
    )

    expect(result.document.revision).toBe(document.revision + 1)
    expect(result.document.assets).toHaveLength(1)
    expect(contentPage(result.document)).toMatchObject({ layoutId: 'focus' })
    const undone = applyAlbumPatches(result.document, result.inversePatches)
    expect(undone.assets).toEqual([])
    expect(undone.pages).toHaveLength(1)
  })

  it('places assets as image blocks in one undoable revision', () => {
    const { document, ids } = seededDocument(2)
    const withPage = run(document, { type: 'add-page' }, ids).document
    const pageId = contentPage(withPage).id
    const before = structuredClone(withPage)
    const result = run(
      withPage,
      {
        type: 'place-assets',
        pageId,
        assetIds: ['asset-1', 'asset-2'],
        layoutId: 'split-even'
      },
      ids,
      2
    )
    const page = contentPage(result.document)

    expect(result.document.revision).toBe(withPage.revision + 1)
    expect(result.document.updatedAt).toBe('2026-08-15T12:02:00.000Z')
    expect(result.patches.some((patch) => patch.path[0] === 'revision')).toBe(false)
    expect(withPage).toEqual(before)
    expect(
      page.blocks.map((block) => [block.type, block.type === 'image' && block.assetId])
    ).toEqual([
      ['image', 'asset-1'],
      ['image', 'asset-2']
    ])
    expect(page.layoutId).toBe('split-even')
    expect(page.blocks.map((block) => block.transform)).toEqual(
      getPageLayout('split-even').slots.map((slot) => slot.transform)
    )
    expect(AlbumDocumentSchema.parse(result.document)).toEqual(result.document)

    const undone = applyAlbumPatches(result.document, result.inversePatches, {
      now: '2026-08-15T12:03:00.000Z'
    })
    expect(contentPage(undone).blocks).toEqual([])
  })

  it('adds all block types on cover and content pages with command-owned ids', () => {
    const { document, ids } = seededDocument(1)
    const withPage = run(document, { type: 'add-page' }, ids).document
    const coverId = withPage.pages[0].id
    const pageId = contentPage(withPage).id
    const withImage = run(
      withPage,
      { type: 'add-block', pageId: coverId, block: { type: 'image', assetId: 'asset-1' } },
      ids,
      2
    ).document
    const withText = run(
      withImage,
      {
        type: 'add-block',
        pageId,
        block: { type: 'rich-text', document: createRichTextDocument('第一页') }
      },
      ids,
      3
    ).document
    const withDecoration = run(
      withText,
      {
        type: 'add-block',
        pageId,
        block: {
          type: 'decoration',
          decoration: { kind: 'icon', resourceId: 'camera', color: '#356fc6' }
        }
      },
      ids,
      4
    ).document

    expect(withDecoration.pages[0].blocks.at(-1)).toMatchObject({
      type: 'image',
      assetId: 'asset-1'
    })
    expect(contentPage(withDecoration).blocks.map((block) => block.type)).toEqual([
      'rich-text',
      'decoration'
    ])
    expect(
      new Set(withDecoration.pages.flatMap((page) => page.blocks.map((block) => block.id))).size
    ).toBe(withDecoration.pages.reduce((count, page) => count + page.blocks.length, 0))
    expect(withDecoration.revision).toBe(withPage.revision + 3)

    expect(
      AlbumCommandSchema.safeParse({
        type: 'add-block',
        pageId,
        block: {
          id: 'caller-owned-id',
          type: 'decoration',
          decoration: { kind: 'sticker', resourceId: 'washi-tape' }
        }
      }).success
    ).toBe(false)
  })

  it('uses one ordered block layer for transform, move, duplicate and delete on every page kind', () => {
    const { document, ids } = seededDocument(1)
    const withPage = run(document, { type: 'add-page' }, ids).document
    const pageId = contentPage(withPage).id
    const withImage = run(
      withPage,
      { type: 'place-assets', pageId, assetIds: ['asset-1'] },
      ids
    ).document
    const withText = run(
      withImage,
      {
        type: 'add-block',
        pageId,
        block: { type: 'rich-text', document: createRichTextDocument('图层文字') }
      },
      ids
    ).document
    const mixed = run(
      withText,
      {
        type: 'add-block',
        pageId,
        block: {
          type: 'decoration',
          decoration: { kind: 'sticker', resourceId: 'washi-tape' }
        }
      },
      ids
    ).document
    const [image, text, decoration] = contentPage(mixed).blocks

    const layered = run(
      mixed,
      { type: 'move-block-layer', pageId, blockId: image.id, direction: 'front' },
      ids,
      2
    ).document
    expect(contentPage(layered).blocks.map((block) => block.id)).toEqual([
      text.id,
      decoration.id,
      image.id
    ])

    const cover = layered.pages[0]
    const coverText = cover.blocks[0]
    const transform = { x: 0.2, y: 0.2, width: 0.5, height: 0.2, rotationDeg: 8 }
    const transformed = run(
      layered,
      { type: 'set-block-transform', pageId: cover.id, blockId: coverText.id, transform },
      ids,
      3
    ).document
    expect(transformed.pages[0].blocks[0].transform).toEqual(transform)

    const duplicated = run(
      transformed,
      { type: 'duplicate-block', pageId, blockId: text.id },
      ids,
      4
    ).document
    const duplicate = contentPage(duplicated).blocks[1]
    expect(duplicate).toMatchObject({ type: 'rich-text' })
    expect(duplicate.id).not.toBe(text.id)
    if (duplicate.type !== 'rich-text' || text.type !== 'rich-text') {
      throw new Error('expected rich text blocks')
    }
    expect(duplicate.document).toEqual(text.document)

    const deleted = run(
      duplicated,
      { type: 'delete-block', pageId, blockId: decoration.id },
      ids,
      5
    ).document
    expect(contentPage(deleted).blocks.some((block) => block.id === decoration.id)).toBe(false)
    expect(deleted.revision).toBe(mixed.revision + 4)
  })

  it('updates rich text atomically and rejects non-rich-text targets', () => {
    const { document, ids } = seededDocument(1)
    const withPage = run(document, { type: 'add-page', assetIds: ['asset-1'] }, ids).document
    const pageId = contentPage(withPage).id
    const withText = run(
      withPage,
      {
        type: 'add-block',
        pageId,
        block: { type: 'rich-text', document: createRichTextDocument('旧文字') }
      },
      ids
    ).document
    const [image, text] = contentPage(withText).blocks
    const replacement = createRichTextDocument('新的段落', { format: 1, align: 'center' })
    const updated = run(
      withText,
      { type: 'update-rich-text', pageId, blockId: text.id, document: replacement },
      ids,
      2
    ).document

    expect(contentPage(updated).blocks[1]).toMatchObject({
      id: text.id,
      type: 'rich-text',
      document: replacement
    })
    expect(updated.revision).toBe(withText.revision + 1)
    expect(() =>
      run(
        updated,
        { type: 'update-rich-text', pageId, blockId: image.id, document: replacement },
        ids,
        3
      )
    ).toThrowError(/RichTextBlock/)
  })

  it('atomically edits image blocks and strictly rejects non-image targets', () => {
    const { document, ids } = seededDocument(1)
    const withPage = run(document, { type: 'add-page', assetIds: ['asset-1'] }, ids).document
    const page = contentPage(withPage)
    const blockId = page.blocks[0].id
    const edited = run(
      withPage,
      {
        type: 'update-image-edit',
        pageId: page.id,
        blockId,
        crop: {
          area: { x: 10, y: 15, width: 70, height: 60 },
          rotationDeg: 17,
          flipX: true,
          flipY: false
        },
        effects: {
          brightness: 1.1,
          contrast: 1.2,
          saturation: 0.9,
          hueDeg: 8,
          sepia: 0.1,
          grayscale: 0,
          blurPx: 0.5,
          vignette: 0.2
        },
        mask: { kind: 'rounded' },
        caption: {
          enabled: true,
          text: '海边日落',
          placement: 'inside-bottom',
          style: {
            fontFamily: 'serif',
            fontSize: 15,
            color: '#ffffff',
            align: 'center',
            weight: '600',
            lineHeight: 1.4
          }
        }
      },
      ids,
      2
    ).document
    expect(edited.revision).toBe(withPage.revision + 1)
    expect(contentPage(edited).blocks[0]).toMatchObject({
      crop: { rotationDeg: 17, flipX: true },
      effects: { contrast: 1.2, vignette: 0.2 },
      mask: { kind: 'rounded' },
      caption: { enabled: true, text: '海边日落' }
    })

    const preset = run(
      edited,
      {
        type: 'apply-effect-preset',
        pageId: page.id,
        blockId,
        presetId: 'film'
      },
      ids,
      3
    ).document
    const presetBlock = contentPage(preset).blocks[0]
    expect(presetBlock.type).toBe('image')
    if (presetBlock.type !== 'image') throw new Error('expected image block')
    expect(presetBlock.effects).toEqual(applyImageEffectPreset('film'))

    const cover = preset.pages[0]
    const coverTextId = cover.blocks[0].id
    expect(() =>
      run(
        preset,
        {
          type: 'update-image-edit',
          pageId: cover.id,
          blockId: coverTextId,
          mask: { kind: 'arch' }
        },
        ids,
        4
      )
    ).toThrowError(/ImageBlock/)
    expect(() =>
      run(
        preset,
        {
          type: 'apply-effect-preset',
          pageId: cover.id,
          blockId: coverTextId,
          presetId: 'film'
        },
        ids,
        4
      )
    ).toThrowError(/ImageBlock/)
  })

  it('replaces only decoration content and limits color changes to icons', () => {
    const { document, ids } = seededDocument(1)
    const withPage = run(document, { type: 'add-page', assetIds: ['asset-1'] }, ids).document
    const pageId = contentPage(withPage).id
    const transform = { x: 0.7, y: 0.1, width: 0.12, height: 0.18, rotationDeg: -9 }
    const withTarget = run(
      withPage,
      {
        type: 'add-block',
        pageId,
        block: {
          type: 'decoration',
          decoration: { kind: 'sticker', resourceId: 'washi-tape' },
          transform
        }
      },
      ids
    ).document
    const withSecondSticker = run(
      withTarget,
      {
        type: 'add-block',
        pageId,
        block: {
          type: 'decoration',
          decoration: { kind: 'sticker', resourceId: 'postage-stamp' }
        }
      },
      ids
    ).document
    const [image, target, secondSticker] = contentPage(withSecondSticker).blocks
    const beforeOrder = contentPage(withSecondSticker).blocks.map((block) => block.id)
    const replacement = { kind: 'icon', resourceId: 'heart', color: '#b42318' } as const
    const replaced = run(
      withSecondSticker,
      { type: 'replace-decoration', pageId, blockId: target.id, decoration: replacement },
      ids,
      2
    )
    const replacedTarget = contentPage(replaced.document).blocks[1]

    expect(contentPage(replaced.document).blocks.map((block) => block.id)).toEqual(beforeOrder)
    expect(replacedTarget).toMatchObject({ id: target.id, transform, decoration: replacement })
    expect(replaced.patches).toEqual([
      {
        op: 'replace',
        path: ['pages', 1, 'blocks', 1, 'decoration'],
        value: replacement
      }
    ])

    const colored = run(
      replaced.document,
      { type: 'set-icon-color', pageId, blockId: target.id, color: '#356fc6' },
      ids,
      3
    ).document
    expect(contentPage(colored).blocks[1]).toMatchObject({
      id: target.id,
      transform,
      decoration: { ...replacement, color: '#356fc6' }
    })
    expect(() =>
      run(
        colored,
        {
          type: 'replace-decoration',
          pageId,
          blockId: image.id,
          decoration: replacement
        },
        ids,
        4
      )
    ).toThrowError(/DecorationBlock/)
    expect(() =>
      run(
        colored,
        { type: 'set-icon-color', pageId, blockId: secondSticker.id, color: '#356fc6' },
        ids,
        4
      )
    ).toThrowError(/Icon/)
  })

  it('retains page ordering, theme and project title commands', () => {
    const { document, ids } = seededDocument(2)
    const withFirst = run(
      document,
      {
        type: 'add-page',
        assetIds: ['asset-1', 'asset-2'],
        layoutId: 'split-even'
      },
      ids
    ).document
    const first = contentPage(withFirst)
    expect(first.layoutId).toBe('split-even')
    expect(withFirst.revision).toBe(document.revision + 1)
    const withSecond = run(withFirst, { type: 'add-page', afterPageId: first.id }, ids, 2).document
    const second = withSecond.pages[2]
    const reordered = run(
      withSecond,
      { type: 'reorder-page', pageId: second.id, toIndex: 1 },
      ids,
      3
    ).document
    expect(reordered.pages.map((page) => page.id)).toEqual([
      document.pages[0].id,
      second.id,
      first.id
    ])

    const deleted = run(reordered, { type: 'delete-page', pageId: second.id }, ids, 4).document
    const themed = run(deleted, { type: 'set-theme', themeId: 'film' }, ids, 5).document
    const titled = run(themed, { type: 'set-project-title', title: '新标题' }, ids, 6).document

    expect(titled).toMatchObject({ themeId: 'film', title: '新标题' })
    expect(titled.pages.map((page) => page.id)).toEqual([document.pages[0].id, first.id])
    expect(titled.revision).toBe(document.revision + 6)
    expect(() =>
      run(titled, { type: 'delete-page', pageId: titled.pages[0].id }, ids, 7)
    ).toThrowError(/封面不能删除/)
  })

  it('applies mixed layouts by stable type order without touching decorations', () => {
    const { document, ids } = seededDocument(2)
    const withPage = run(
      document,
      { type: 'add-page', assetIds: ['asset-1', 'asset-2'] },
      ids
    ).document
    const pageId = contentPage(withPage).id
    const withDecoration = run(
      withPage,
      {
        type: 'add-block',
        pageId,
        block: {
          type: 'decoration',
          decoration: { kind: 'sticker', resourceId: 'botanical-sprig' },
          transform: { x: 0.44, y: 0.72, width: 0.14, height: 0.2, rotationDeg: 11 }
        }
      },
      ids
    ).document
    const interleaved = run(
      withDecoration,
      {
        type: 'move-block-layer',
        pageId,
        blockId: contentPage(withDecoration).blocks[2].id,
        direction: 'backward'
      },
      ids
    ).document
    const ready = run(
      interleaved,
      {
        type: 'add-block',
        pageId,
        block: { type: 'rich-text', document: createRichTextDocument('双图故事') }
      },
      ids
    ).document
    const pageBefore = structuredClone(contentPage(ready))
    const decorationIndex = pageBefore.blocks.findIndex((block) => block.type === 'decoration')
    const decorationBefore = structuredClone(pageBefore.blocks[decorationIndex])
    const layout = getPageLayout('two-image-story')
    const command = run(ready, { type: 'apply-page-layout', pageId, layoutId: layout.id }, ids, 2)
    const laidOut = contentPage(command.document)
    const imageSlots = layout.slots.filter((slot) => slot.accepts === 'image')
    const textSlots = layout.slots.filter((slot) => slot.accepts === 'rich-text')

    expect(command.document.revision).toBe(ready.revision + 1)
    expect(laidOut.layoutId).toBe(layout.id)
    expect(
      laidOut.blocks.filter((block) => block.type === 'image').map((block) => block.transform)
    ).toEqual(imageSlots.map((slot) => slot.transform))
    expect(
      laidOut.blocks.filter((block) => block.type === 'rich-text').map((block) => block.transform)
    ).toEqual(textSlots.map((slot) => slot.transform))
    expect(laidOut.blocks[decorationIndex]).toEqual(decorationBefore)
    expect(
      command.patches.some(
        (patch) =>
          patch.path[0] === 'pages' &&
          patch.path[1] === 1 &&
          patch.path[2] === 'blocks' &&
          patch.path[3] === decorationIndex
      )
    ).toBe(false)

    const undone = applyAlbumPatches(command.document, command.inversePatches, {
      now: '2026-08-15T12:03:00.000Z'
    })
    const redone = applyAlbumPatches(undone, command.patches, {
      now: '2026-08-15T12:04:00.000Z'
    })

    expect(undone.revision).toBe(command.document.revision + 1)
    expect(redone.revision).toBe(undone.revision + 1)
    expect(contentPage(undone)).toEqual(pageBefore)
    expect(contentPage(redone)).toEqual(laidOut)
  })

  it('rejects missing assets and incompatible layouts without mutation', () => {
    const { document, ids } = seededDocument(1)
    const before = structuredClone(document)
    expect(() => run(document, { type: 'add-page', assetIds: ['missing'] }, ids)).toThrowError(
      AlbumCommandError
    )
    expect(() =>
      run(document, { type: 'add-page', assetIds: ['asset-1'], layoutId: 'split-even' }, ids)
    ).toThrowError(/需要 2 张图片和 0 个文字 Block/)
    expect(document).toEqual(before)

    const withPage = run(document, { type: 'add-page', assetIds: ['asset-1'] }, ids).document
    const pageId = contentPage(withPage).id
    const ready = run(
      withPage,
      {
        type: 'add-block',
        pageId,
        block: { type: 'rich-text', document: createRichTextDocument('数量不匹配') }
      },
      ids
    ).document
    const beforeMismatch = structuredClone(ready)
    expect(() =>
      run(ready, { type: 'apply-page-layout', pageId, layoutId: 'two-image-story' }, ids)
    ).toThrowError(/需要 2 张图片和 1 个文字 Block/)
    expect(() =>
      run(ready, { type: 'apply-page-layout', pageId: ready.pages[0].id, layoutId: 'focus' }, ids)
    ).toThrowError(/不支持封面/)
    expect(ready).toEqual(beforeMismatch)
  })

  it('clears layoutId only for image or rich-text geometry and membership changes', () => {
    const { document, ids } = seededDocument(1)
    const withPage = run(document, { type: 'add-page', assetIds: ['asset-1'] }, ids).document
    const pageId = contentPage(withPage).id
    const withText = run(
      withPage,
      {
        type: 'add-block',
        pageId,
        block: { type: 'rich-text', document: createRichTextDocument('图文焦点') }
      },
      ids
    ).document
    const withDecoration = run(
      withText,
      {
        type: 'add-block',
        pageId,
        block: {
          type: 'decoration',
          decoration: { kind: 'icon', resourceId: 'sparkles', color: '#b42318' }
        }
      },
      ids
    ).document
    const laidOut = run(
      withDecoration,
      { type: 'apply-page-layout', pageId, layoutId: 'image-text-focus' },
      ids
    ).document
    const [image, text, decoration] = contentPage(laidOut).blocks

    const invalidatingCommands: AlbumCommand[] = [
      {
        type: 'set-block-transform',
        pageId,
        blockId: image.id,
        transform: { x: 0.1, y: 0.1, width: 0.5, height: 0.5, rotationDeg: 3 }
      },
      {
        type: 'set-block-transform',
        pageId,
        blockId: text.id,
        transform: { x: 0.2, y: 0.2, width: 0.4, height: 0.3, rotationDeg: 0 }
      },
      { type: 'place-assets', pageId, assetIds: ['asset-1'] },
      {
        type: 'add-block',
        pageId,
        block: { type: 'rich-text', document: createRichTextDocument('新增文字') }
      },
      { type: 'duplicate-block', pageId, blockId: image.id },
      { type: 'delete-block', pageId, blockId: text.id },
      { type: 'move-block-layer', pageId, blockId: image.id, direction: 'front' }
    ]
    for (const command of invalidatingCommands) {
      expect(contentPage(run(laidOut, command, ids).document).layoutId).toBeNull()
    }

    const decorationCommands: AlbumCommand[] = [
      {
        type: 'set-block-transform',
        pageId,
        blockId: decoration.id,
        transform: { x: 0.7, y: 0.7, width: 0.1, height: 0.1, rotationDeg: 12 }
      },
      {
        type: 'add-block',
        pageId,
        block: {
          type: 'decoration',
          decoration: { kind: 'sticker', resourceId: 'travel-tag' }
        }
      },
      { type: 'duplicate-block', pageId, blockId: decoration.id },
      { type: 'delete-block', pageId, blockId: decoration.id },
      { type: 'move-block-layer', pageId, blockId: decoration.id, direction: 'back' },
      {
        type: 'replace-decoration',
        pageId,
        blockId: decoration.id,
        decoration: { kind: 'sticker', resourceId: 'starburst' }
      },
      { type: 'set-icon-color', pageId, blockId: decoration.id, color: '#356fc6' }
    ]
    for (const command of decorationCommands) {
      expect(contentPage(run(laidOut, command, ids).document).layoutId).toBe('image-text-focus')
    }
  })

  it('strictly rejects retired image-only and fixed-text commands', () => {
    const retiredCommands = [
      { type: 'set-cover-hero', assetId: 'asset-1' },
      { type: 'set-cover-text', field: 'title', value: '旧封面标题' },
      { type: 'set-page-note', pageId: 'page-1', note: {} },
      { type: 'set-transform', pageId: 'page-1', elementId: 'element-1', transform: {} },
      { type: 'move-layer', pageId: 'page-1', elementId: 'element-1', direction: 'front' },
      { type: 'duplicate-image', pageId: 'page-1', elementId: 'element-1' },
      { type: 'delete-image', pageId: 'page-1', elementId: 'element-1' },
      { type: 'apply-template', pageId: 'page-1', templateId: 'focus' }
    ]

    for (const command of retiredCommands) {
      expect(AlbumCommandSchema.safeParse(command).success).toBe(false)
    }
    expect(
      AlbumCommandSchema.safeParse({
        type: 'place-assets',
        pageId: 'page-1',
        assetIds: ['asset-1'],
        templateId: 'focus'
      }).success
    ).toBe(false)
  })
})
