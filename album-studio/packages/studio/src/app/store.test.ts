import {
  createAlbumDocument,
  createRichTextDocument,
  type AssetRecord,
  type RichTextBlock
} from '@album-studio/common'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudioStore } from './store'

let id = 0
const nextId = (): string => `id-${++id}`

function asset(assetId = 'asset-a'): AssetRecord {
  return {
    id: assetId,
    fileName: `${assetId}.jpg`,
    contentHash: assetId === 'asset-a' ? 'a'.repeat(64) : 'b'.repeat(64),
    mimeType: 'image/jpeg',
    byteSize: 1024,
    width: 1600,
    height: 1200,
    importedAt: '2026-08-15T12:00:00.000Z'
  }
}

function openEmptyDocument(): void {
  useStudioStore
    .getState()
    .openDocument(
      createAlbumDocument({ title: '测试相册', now: '2026-08-15T12:00:00.000Z' }, nextId)
    )
}

function coverTextBlock(): { pageId: string; block: RichTextBlock } {
  const cover = useStudioStore.getState().document?.pages[0]
  const block = cover?.blocks.find((candidate) => candidate.type === 'rich-text')
  if (!cover || !block || block.type !== 'rich-text') throw new Error('封面文字夹具不完整')
  return { pageId: cover.id, block }
}

describe('studio command store', () => {
  beforeEach(() => {
    id = 0
    useStudioStore.getState().closeDocument()
    openEmptyDocument()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores Immer patches and restores a command with undo and redo', () => {
    const store = useStudioStore.getState()
    store.dispatch({ type: 'register-assets', assets: [asset()] })
    store.dispatch({ type: 'add-page', assetIds: ['asset-a'], layoutId: 'focus' })

    expect(useStudioStore.getState().document?.pages).toHaveLength(2)
    expect(useStudioStore.getState().history.past).toHaveLength(2)
    expect(useStudioStore.getState().history.past[1].patches.length).toBeGreaterThan(0)

    useStudioStore.getState().undo()
    expect(useStudioStore.getState().document?.pages).toHaveLength(1)
    useStudioStore.getState().redo()
    expect(useStudioStore.getState().document?.pages).toHaveLength(2)
  })

  it('records a multi-command user action as one undo entry', () => {
    useStudioStore.getState().dispatchMany([
      { type: 'register-assets', assets: [asset()] },
      { type: 'add-page', assetIds: ['asset-a'], layoutId: 'focus' }
    ])

    expect(useStudioStore.getState().document?.assets).toHaveLength(1)
    expect(useStudioStore.getState().document?.pages).toHaveLength(2)
    expect(useStudioStore.getState().document?.revision).toBe(1)
    expect(useStudioStore.getState().history.past).toHaveLength(1)

    useStudioStore.getState().undo()
    expect(useStudioStore.getState().document?.assets).toHaveLength(0)
    expect(useStudioStore.getState().document?.pages).toHaveLength(1)
  })

  it('marks command, undo and redo results dirty for the save session', () => {
    useStudioStore.getState().dispatch({ type: 'set-theme', themeId: 'film' })
    expect(useStudioStore.getState().saveState).toBe('dirty')
    useStudioStore.getState().undo()
    expect(useStudioStore.getState().saveState).toBe('dirty')
    useStudioStore.getState().redo()
    expect(useStudioStore.getState().saveState).toBe('dirty')
  })

  it('tracks Block selection across types and clears it at page and delete boundaries', () => {
    const store = useStudioStore.getState()
    store.dispatch({ type: 'register-assets', assets: [asset()] })
    store.dispatch({ type: 'add-page', assetIds: ['asset-a'], layoutId: 'focus' })

    const document = useStudioStore.getState().document
    const cover = document?.pages[0]
    const content = document?.pages[1]
    const coverText = cover?.blocks.find((block) => block.type === 'rich-text')
    const image = content?.blocks.find((block) => block.type === 'image')
    if (!cover || !content || !coverText || !image) throw new Error('测试 Block 夹具不完整')

    store.selectBlock(cover.id, coverText.id)
    expect(useStudioStore.getState()).toMatchObject({
      selectedPageId: cover.id,
      selectedBlockId: coverText.id
    })

    store.selectPage(content.id)
    expect(useStudioStore.getState().selectedBlockId).toBeNull()

    store.selectBlock(content.id, image.id)
    store.dispatch({ type: 'delete-block', pageId: content.id, blockId: image.id })
    expect(useStudioStore.getState().selectedBlockId).toBeNull()
  })

  it('opens Block editing without losing selection and restores the last persistent panel', () => {
    const { pageId, block } = coverTextBlock()
    const store = useStudioStore.getState()

    store.setRightPanelTab('assets')
    store.selectBlock(pageId, block.id)
    expect(useStudioStore.getState()).toMatchObject({
      selectedBlockId: block.id,
      rightPanelTab: 'block',
      lastPersistentPanelTab: 'assets'
    })

    store.setRightPanelTab('components')
    expect(useStudioStore.getState()).toMatchObject({
      selectedBlockId: block.id,
      rightPanelTab: 'components',
      lastPersistentPanelTab: 'components'
    })

    store.selectBlock(pageId, block.id)
    expect(useStudioStore.getState().rightPanelTab).toBe('block')
    store.selectPage(pageId)
    expect(useStudioStore.getState()).toMatchObject({
      selectedBlockId: null,
      rightPanelTab: 'components',
      rightPanelSheetOpen: false
    })
  })

  it('merges continuous rich-text drafts into one command after the idle window', () => {
    vi.useFakeTimers()
    const { pageId, block } = coverTextBlock()
    const initialRevision = useStudioStore.getState().document?.revision

    useStudioStore
      .getState()
      .setRichTextDraft(pageId, block.id, createRichTextDocument('第一次输入'))
    vi.advanceTimersByTime(400)
    useStudioStore.getState().setRichTextDraft(pageId, block.id, createRichTextDocument('最终文字'))
    vi.advanceTimersByTime(649)

    expect(useStudioStore.getState().document?.revision).toBe(initialRevision)
    expect(useStudioStore.getState().history.past).toHaveLength(0)
    expect(JSON.stringify(useStudioStore.getState().richTextDraft?.document)).toContain('最终文字')

    vi.advanceTimersByTime(1)
    const state = useStudioStore.getState()
    const committed = state.document?.pages[0].blocks.find((candidate) => candidate.id === block.id)
    expect(state.document?.revision).toBe((initialRevision ?? 0) + 1)
    expect(state.history.past).toHaveLength(1)
    expect(state.richTextDraft).toBeNull()
    expect(JSON.stringify(committed)).toContain('最终文字')
  })

  it('commits the latest text before preview and undo restores the previous document', () => {
    const { pageId, block } = coverTextBlock()
    const original = block.document
    useStudioStore
      .getState()
      .setRichTextDraft(pageId, block.id, createRichTextDocument('预览前最后一句'))

    useStudioStore.getState().setExclusiveWorkspace('preview')
    expect(JSON.stringify(useStudioStore.getState().document)).toContain('预览前最后一句')
    expect(useStudioStore.getState().history.past).toHaveLength(1)

    useStudioStore.getState().undo()
    const restored = useStudioStore
      .getState()
      .document?.pages[0].blocks.find((candidate) => candidate.id === block.id)
    expect(restored?.type).toBe('rich-text')
    if (restored?.type === 'rich-text') expect(restored.document).toEqual(original)
  })

  it('flushes a pending text draft into the exact document sent to persistence', async () => {
    const saveDocument = vi.fn(async (document) => ({
      revision: document.revision,
      savedAt: '2026-08-16T12:00:00.000Z'
    }))
    const { pageId, block } = coverTextBlock()
    useStudioStore.getState().connectPersistence(saveDocument)
    useStudioStore
      .getState()
      .setRichTextDraft(pageId, block.id, createRichTextDocument('关闭前不丢字'))

    await useStudioStore.getState().flush()

    expect(saveDocument).toHaveBeenCalledOnce()
    expect(JSON.stringify(saveDocument.mock.calls[0][0])).toContain('关闭前不丢字')
    expect(useStudioStore.getState().saveState).toBe('saved')
  })
})
