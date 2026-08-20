import { createAlbumDocument, type AssetRecord } from '@album-studio/common'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { useStudioStore } from '@/app/store'
import { BlockEditPanel } from './block-edit-panel'

const asset: AssetRecord = {
  id: 'asset-1',
  fileName: '照片.jpg',
  contentHash: 'a'.repeat(64),
  mimeType: 'image/jpeg',
  byteSize: 1_024,
  width: 1_600,
  height: 1_200,
  importedAt: '2026-08-16T12:00:00.000Z'
}

let id = 0
const nextId = (): string => `id-${++id}`

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => DOMRect.fromRect()
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
})

function renderPanel(): ReturnType<typeof render> {
  const platform = {
    kind: 'web',
    capabilities: new Set<StudioPlatform['capabilities'] extends Set<infer T> ? T : never>(),
    projects: {
      listRecent: vi.fn(async () => []),
      create: vi.fn(async () => null),
      chooseAndOpen: vi.fn(async () => null),
      open: vi.fn(async () => {
        throw new Error('测试不应打开项目')
      }),
      save: vi.fn(async () => ({ revision: 0, savedAt: '' }))
    },
    assets: {
      pickCandidates: vi.fn(async () => null),
      importCandidates: vi.fn(async () => null),
      releaseCandidates: vi.fn(),
      relink: vi.fn(async () => null),
      getSource: vi.fn(async () => ''),
      releaseSource: vi.fn()
    },
    export: { pdf: vi.fn(async () => null) },
    imageErase: {
      detect: vi.fn(async () => ({ maskBase64: 'iVBORw0KGgo=', width: 100, height: 100 })),
      apply: vi.fn(async () => ({ eraseKey: 'abc123', width: 100, height: 100 }))
    },
    lifecycle: {
      onCloseRequest: vi.fn(() => () => undefined),
      closeReady: vi.fn(async () => undefined)
    }
  } satisfies StudioPlatform
  return render(
    <StudioPlatformProvider platform={platform}>
      <BlockEditPanel />
    </StudioPlatformProvider>
  )
}

describe('BlockEditPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    id = 0
    useStudioStore.getState().closeDocument()
    useStudioStore
      .getState()
      .openDocument(
        createAlbumDocument({ title: 'Block 编辑', now: '2026-08-16T12:00:00.000Z' }, nextId)
      )
  })

  it('为图片 Block 提供深度编辑和通用图层操作', async () => {
    const user = userEvent.setup()
    const store = useStudioStore.getState()
    store.dispatch({ type: 'register-assets', assets: [asset] })
    store.dispatch({ type: 'add-page', assetIds: [asset.id], layoutId: 'focus' })
    const page = useStudioStore.getState().document?.pages[1]
    const block = page?.blocks[0]
    if (!page || !block || block.type !== 'image') throw new Error('图片夹具不完整')
    store.selectBlock(page.id, block.id)

    renderPanel()
    expect(screen.getByRole('button', { name: '裁剪与美化' })).toBeVisible()
    expect(screen.getByRole('button', { name: '复制 Block' })).toBeVisible()
    // 网页版不声明 erase-people 能力，消除人物入口隐藏
    expect(screen.queryByRole('button', { name: '消除人物' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '水平翻转' }))
    const updated = useStudioStore
      .getState()
      .document?.pages[1].blocks.find((candidate) => candidate.id === block.id)
    expect(updated?.type).toBe('image')
    if (updated?.type === 'image') expect(updated.crop.flipX).toBe(true)
  })

  it('面板卸载前提交仍在编辑的照片说明', async () => {
    const user = userEvent.setup()
    const store = useStudioStore.getState()
    store.dispatch({ type: 'register-assets', assets: [asset] })
    store.dispatch({ type: 'add-page', assetIds: [asset.id], layoutId: 'focus' })
    const page = useStudioStore.getState().document?.pages[1]
    const block = page?.blocks[0]
    if (!page || !block || block.type !== 'image') throw new Error('图片夹具不完整')
    store.selectBlock(page.id, block.id)

    const view = renderPanel()
    await user.type(screen.getByLabelText('照片说明'), '切换前未失焦的说明')
    view.unmount()

    const updated = useStudioStore
      .getState()
      .document?.pages[1].blocks.find((candidate) => candidate.id === block.id)
    expect(updated?.type).toBe('image')
    if (updated?.type === 'image') expect(updated.caption.text).toBe('切换前未失焦的说明')
  })

  it('切换文字 Block 竖排前提交草稿并支持撤销重做', async () => {
    const user = userEvent.setup()
    const store = useStudioStore.getState()
    const page = store.document?.pages[0]
    const block = page?.blocks[0]
    if (!page || !block || block.type !== 'rich-text') throw new Error('封面文字夹具不完整')
    store.selectBlock(page.id, block.id)

    renderPanel()
    const editor = await screen.findByRole('textbox', { name: '富文本内容' })
    expect(screen.getByRole('radio', { name: '横排' })).toHaveAttribute('data-state', 'on')
    await user.type(editor, '追加')
    await waitFor(() => expect(useStudioStore.getState().richTextDraft).not.toBeNull())

    await user.click(screen.getByRole('radio', { name: '竖排' }))
    const updated = useStudioStore
      .getState()
      .document?.pages[0].blocks.find((candidate) => candidate.id === block.id)
    expect(updated?.type).toBe('rich-text')
    if (updated?.type !== 'rich-text') throw new Error('更新后文字 Block 丢失')
    expect((updated as unknown as { writingMode?: unknown }).writingMode).toBe('vertical')
    expect(JSON.stringify(updated.document)).toContain('追加')
    expect(useStudioStore.getState().richTextDraft).toBeNull()
    expect(editor).toHaveAttribute('data-writing-mode', 'vertical')

    useStudioStore.getState().undo()
    const undone = useStudioStore
      .getState()
      .document?.pages[0].blocks.find((candidate) => candidate.id === block.id)
    expect(
      undone?.type === 'rich-text'
        ? (undone as unknown as { writingMode?: unknown }).writingMode
        : null
    ).toBe('horizontal')
    expect(undone?.type === 'rich-text' ? JSON.stringify(undone.document) : '').toContain('追加')

    useStudioStore.getState().redo()
    const redone = useStudioStore
      .getState()
      .document?.pages[0].blocks.find((candidate) => candidate.id === block.id)
    expect(
      redone?.type === 'rich-text'
        ? (redone as unknown as { writingMode?: unknown }).writingMode
        : null
    ).toBe('vertical')
  })

  it('为图标提供颜色和保持选中的组件替换入口', async () => {
    const user = userEvent.setup()
    const store = useStudioStore.getState()
    const page = store.document?.pages[0]
    if (!page) throw new Error('封面夹具不完整')
    store.dispatch({
      type: 'add-block',
      pageId: page.id,
      block: {
        type: 'decoration',
        decoration: { kind: 'icon', resourceId: 'heart', color: '#a84835' }
      }
    })
    const block = useStudioStore.getState().document?.pages[0].blocks.at(-1)
    if (!block || block.type !== 'decoration') throw new Error('装饰夹具不完整')
    store.selectBlock(page.id, block.id)

    renderPanel()
    expect(screen.getByLabelText('图标颜色')).toHaveValue('#a84835')
    await user.click(screen.getByRole('button', { name: '打开组件库' }))
    expect(useStudioStore.getState()).toMatchObject({
      selectedBlockId: block.id,
      rightPanelTab: 'components'
    })
  })
})
