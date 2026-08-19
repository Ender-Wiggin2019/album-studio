import {
  createAlbumDocument,
  createContentPage,
  type AlbumDocument,
  type AssetRecord
} from '@album-studio/common'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import type { ImportCandidate, ImportCandidateSession } from '@/app/platform/studio-platform'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import { hasPendingAssetImports, waitForAssetImports } from '@/app/pending-asset-imports'
import { useStudioStore } from '@/app/store'
import { BlockPlacementDragDropProvider } from '@/features/block-placement/drag-drop-provider'
import { ProjectAssetsPanel } from './asset-library'

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class ResizeObserver {
      observe(): void {
        return undefined
      }
      unobserve(): void {
        return undefined
      }
      disconnect(): void {
        return undefined
      }
    }
  })
})

function asset(index: number): AssetRecord {
  return {
    id: `asset-${index}`,
    fileName: `照片 ${index}.jpg`,
    contentHash: index.toString(16).padStart(64, '0'),
    mimeType: 'image/jpeg',
    byteSize: 1_024 + index,
    width: 1_600,
    height: 1_200,
    importedAt: `2026-08-${String(index).padStart(2, '0')}T12:00:00.000Z`
  }
}

const platform = {
  kind: 'web',
  capabilities: new Set(['folder-import', 'asset-relink']),
  assets: {
    pickCandidates: vi.fn(),
    importCandidates: vi.fn(),
    releaseCandidates: vi.fn(),
    relink: vi.fn(),
    getSource: vi.fn().mockResolvedValue('data:image/gif;base64,R0lGODlhAQABAAAAACw='),
    releaseSource: vi.fn()
  }
} as unknown as StudioPlatform

function openDocument(assetCount: number, withContentPage = false): AlbumDocument {
  const document = createAlbumDocument({
    title: '项目素材测试',
    now: '2026-08-16T12:00:00.000Z'
  })
  document.assets.push(...Array.from({ length: assetCount }, (_, index) => asset(index + 1)))
  if (withContentPage) document.pages.push(createContentPage(() => 'page-content'))
  useStudioStore.getState().openDocument(document)
  return document
}

function renderPanel(): ReturnType<typeof render> {
  return render(
    <StudioPlatformProvider platform={platform}>
      <BlockPlacementDragDropProvider>
        <ProjectAssetsPanel />
      </BlockPlacementDragDropProvider>
    </StudioPlatformProvider>
  )
}

function candidateSession(candidates: ImportCandidate[], id = 'session-1'): ImportCandidateSession {
  return { id, candidates }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

describe('ProjectAssetsPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useStudioStore.getState().closeDocument()
    vi.clearAllMocks()
  })

  it('单击在当前封面中央按原图比例添加 ImageBlock，复选框只改批量选择', () => {
    openDocument(1)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '添加 照片 1.jpg 到当前页' }))

    let state = useStudioStore.getState()
    const cover = state.document?.pages[0]
    expect(cover?.blocks).toHaveLength(4)
    const added = cover?.blocks.at(-1)
    expect(added).toMatchObject({
      type: 'image',
      assetId: 'asset-1',
      transform: { width: 0.42, rotationDeg: 0 }
    })
    if (added?.type !== 'image') throw new Error('测试夹具不是图片 Block')
    const asset = state.document?.assets[0]
    if (!asset) throw new Error('缺少素材记录')
    const visualRatio =
      (added.transform.width * (state.document?.pageSpec.widthMm ?? 1)) /
      (added.transform.height * (state.document?.pageSpec.heightMm ?? 1))
    expect(visualRatio).toBeCloseTo(asset.width / asset.height, 6)
    expect(added.transform.x).toBeCloseTo(0.29)
    expect(added.transform.y).toBeCloseTo(0.27725)
    expect(state.selectedAssetIds).toEqual([])

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 照片 1.jpg' }))
    state = useStudioStore.getState()
    expect(state.selectedAssetIds).toEqual(['asset-1'])
    expect(state.document?.pages[0].blocks).toHaveLength(4)
  })

  it('批量添加到当前页保持照片原图比例且不套固定布局', () => {
    openDocument(2, true)
    useStudioStore.getState().selectPage('page-content')
    useStudioStore.getState().setAssetSelection(['asset-1', 'asset-2'])
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '批量添加' }))
    fireEvent.click(screen.getByRole('button', { name: /添加到当前页/ }))

    const state = useStudioStore.getState()
    const page = state.document?.pages.find((candidate) => candidate.id === 'page-content')
    expect(page?.layoutId).toBeNull()
    expect(page?.blocks.map((block) => (block.type === 'image' ? block.assetId : null))).toEqual([
      'asset-1',
      'asset-2'
    ])
    for (const block of page?.blocks ?? []) {
      if (block.type !== 'image') throw new Error('测试夹具不是图片 Block')
      const asset = state.document?.assets.find((candidate) => candidate.id === block.assetId)
      if (!asset) throw new Error('缺少素材记录')
      const visualRatio =
        (block.transform.width * (state.document?.pageSpec.widthMm ?? 1)) /
        (block.transform.height * (state.document?.pageSpec.heightMm ?? 1))
      expect(visualRatio).toBeCloseTo(asset.width / asset.height, 6)
    }
    expect(state.selectedAssetIds).toEqual([])
    expect(state.history.past).toHaveLength(1)
  })

  it('自动分页使用一次 dispatchMany 原子创建并保持素材顺序', () => {
    const original = openDocument(7)
    useStudioStore
      .getState()
      .setAssetSelection(Array.from({ length: 7 }, (_, index) => `asset-${index + 1}`))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '批量添加' }))
    fireEvent.click(screen.getByRole('button', { name: /自动创建新页/ }))

    const state = useStudioStore.getState()
    const pages = state.document?.pages.slice(1) ?? []
    expect(pages).toHaveLength(2)
    expect(pages[0]?.layoutId).toBeNull()
    expect(pages[1]?.layoutId).toBeNull()
    expect(
      pages.map((page) =>
        page.blocks.map((block) => (block.type === 'image' ? block.assetId : null))
      )
    ).toEqual([['asset-1', 'asset-2', 'asset-3', 'asset-4', 'asset-5', 'asset-6'], ['asset-7']])
    expect(state.document?.revision).toBe(original.revision + 1)
    expect(state.history.past).toHaveLength(1)
    expect(state.selectedAssetIds).toEqual([])
    expect(state.selectedPageId).toBe(pages[0]?.id)
  })

  it('空素材状态保留主操作，并展示逐文件导入失败原因', async () => {
    openDocument(0)
    vi.mocked(platform.assets.pickCandidates).mockResolvedValueOnce(
      candidateSession([
        {
          id: 'candidate-1',
          fileName: '无法解码的超长中文照片文件名.jpg',
          byteSize: 2048,
          previewUrl: 'blob:mock-preview'
        }
      ])
    )
    vi.mocked(platform.assets.importCandidates).mockResolvedValueOnce({
      assets: [],
      duplicateAssetIds: [],
      skipped: [{ fileName: '无法解码的超长中文照片文件名.jpg', reason: '图片编码损坏' }]
    })
    renderPanel()

    expect(screen.getByRole('heading', { name: '导入项目照片' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    expect(await screen.findByRole('heading', { name: '选择要导入的照片' })).toBeVisible()
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 无法解码的超长中文照片文件名.jpg' }))
    fireEvent.click(screen.getByRole('button', { name: '导入所选 1 张' }))

    const failureSummary = await screen.findByText('1 个文件未导入 · 查看详情')
    expect(failureSummary).toBeVisible()
    fireEvent.click(failureSummary)
    expect(screen.getByText('无法解码的超长中文照片文件名.jpg：图片编码损坏')).toBeVisible()
    expect(platform.assets.releaseCandidates).toHaveBeenCalledWith('session-1')
  })

  it('只导入在候选对话框中勾选的照片，并释放未选择的预览', async () => {
    openDocument(0)
    vi.mocked(platform.assets.pickCandidates).mockResolvedValueOnce(
      candidateSession([
        { id: 'candidate-1', fileName: '第一张.jpg', byteSize: 1024, previewUrl: 'blob:1' },
        { id: 'candidate-2', fileName: '第二张.jpg', byteSize: 2048, previewUrl: 'blob:2' },
        { id: 'candidate-3', fileName: '第三张.jpg', byteSize: 3072, previewUrl: 'blob:3' }
      ])
    )
    vi.mocked(platform.assets.importCandidates).mockResolvedValueOnce({
      assets: [asset(1)],
      duplicateAssetIds: [],
      skipped: []
    })
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    await screen.findByRole('heading', { name: '选择要导入的照片' })
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 第二张.jpg' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 第三张.jpg' }))
    expect(screen.getByText('2 / 3 张')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '导入所选 2 张' }))

    expect(platform.assets.importCandidates).toHaveBeenCalledWith(expect.any(String), 'session-1', [
      'candidate-2',
      'candidate-3'
    ])
    await waitFor(() => expect(platform.assets.releaseCandidates).toHaveBeenCalledWith('session-1'))
    expect(useStudioStore.getState().document?.assets.map((candidate) => candidate.id)).toEqual([
      'asset-1'
    ])
  })

  it('取消候选对话框时释放全部预览并保持素材为空', async () => {
    openDocument(0)
    vi.mocked(platform.assets.pickCandidates).mockResolvedValueOnce(
      candidateSession([
        { id: 'candidate-1', fileName: '第一张.jpg', byteSize: 1024, previewUrl: 'blob:1' },
        { id: 'candidate-2', fileName: '第二张.jpg', byteSize: 2048, previewUrl: 'blob:2' }
      ])
    )
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    await screen.findByRole('heading', { name: '选择要导入的照片' })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(platform.assets.releaseCandidates).toHaveBeenCalledWith('session-1')
    expect(platform.assets.importCandidates).not.toHaveBeenCalled()
    expect(useStudioStore.getState().document?.assets).toEqual([])
  })

  it('并发选择乱序返回时只接受最后一次请求并释放迟到会话', async () => {
    openDocument(0)
    const first = deferred<ImportCandidateSession | null>()
    const second = deferred<ImportCandidateSession | null>()
    vi.mocked(platform.assets.pickCandidates)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    renderPanel()

    const pickButton = screen.getByRole('button', { name: '选择照片' })
    act(() => {
      pickButton.click()
      pickButton.click()
    })
    await act(async () => {
      second.resolve(
        candidateSession(
          [{ id: 'candidate-1', fileName: 'B.jpg', byteSize: 2, previewUrl: 'blob:b' }],
          'session-b'
        )
      )
      await second.promise
    })
    expect(await screen.findByText('B.jpg')).toBeVisible()

    await act(async () => {
      first.resolve(
        candidateSession(
          [{ id: 'candidate-1', fileName: 'A.jpg', byteSize: 1, previewUrl: 'blob:a' }],
          'session-a'
        )
      )
      await first.promise
    })

    expect(screen.getByText('B.jpg')).toBeVisible()
    expect(screen.queryByText('A.jpg')).not.toBeInTheDocument()
    expect(platform.assets.releaseCandidates).toHaveBeenCalledWith('session-a')
    expect(platform.assets.releaseCandidates).not.toHaveBeenCalledWith('session-b')
  })

  it('组件卸载后释放迟到的候选会话', async () => {
    openDocument(0)
    const picked = deferred<ImportCandidateSession | null>()
    vi.mocked(platform.assets.pickCandidates).mockReturnValueOnce(picked.promise)
    const { unmount } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    unmount()
    await act(async () => {
      picked.resolve(
        candidateSession(
          [{ id: 'candidate-1', fileName: '迟到.jpg', byteSize: 1, previewUrl: 'blob:late' }],
          'session-late'
        )
      )
      await picked.promise
    })

    expect(platform.assets.releaseCandidates).toHaveBeenCalledWith('session-late')
  })

  it('切换项目后作废旧 picker，切回时也不会保留虚假 busy', async () => {
    const original = openDocument(0)
    const picked = deferred<ImportCandidateSession | null>()
    vi.mocked(platform.assets.pickCandidates).mockReturnValueOnce(picked.promise)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    expect(screen.getByRole('button', { name: '选择照片' })).toBeDisabled()
    const another = createAlbumDocument({ title: '另一个项目' })
    act(() => useStudioStore.getState().openDocument(another))
    expect(screen.getByRole('button', { name: '选择照片' })).toBeEnabled()
    act(() => useStudioStore.getState().openDocument(original))
    expect(screen.getByRole('button', { name: '选择照片' })).toBeEnabled()

    await act(async () => {
      picked.resolve(
        candidateSession(
          [{ id: 'candidate-1', fileName: '旧项目.jpg', byteSize: 1, previewUrl: 'blob:old' }],
          'session-old-project'
        )
      )
      await picked.promise
    })
    expect(platform.assets.releaseCandidates).toHaveBeenCalledWith('session-old-project')
    expect(screen.queryByText('旧项目.jpg')).not.toBeInTheDocument()
  })

  it('组件卸载时释放已打开的候选会话', async () => {
    openDocument(0)
    vi.mocked(platform.assets.pickCandidates).mockResolvedValueOnce(
      candidateSession(
        [{ id: 'candidate-1', fileName: '待释放.jpg', byteSize: 1, previewUrl: 'blob:open' }],
        'session-open'
      )
    )
    const { unmount } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    await screen.findByRole('heading', { name: '选择要导入的照片' })
    unmount()

    expect(platform.assets.releaseCandidates).toHaveBeenCalledWith('session-open')
  })

  it('导入进行中禁止 Esc、关闭按钮和遮罩关闭', async () => {
    openDocument(0)
    const importing = deferred<Awaited<ReturnType<StudioPlatform['assets']['importCandidates']>>>()
    vi.mocked(platform.assets.pickCandidates).mockResolvedValueOnce(
      candidateSession([
        { id: 'candidate-1', fileName: '正在导入.jpg', byteSize: 1, previewUrl: 'blob:busy' }
      ])
    )
    vi.mocked(platform.assets.importCandidates).mockReturnValueOnce(importing.promise)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    await screen.findByRole('heading', { name: '选择要导入的照片' })
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 正在导入.jpg' }))
    fireEvent.click(screen.getByRole('button', { name: '导入所选 1 张' }))

    expect(hasPendingAssetImports()).toBe(true)
    const importIdle = waitForAssetImports()
    expect(screen.getByRole('button', { name: '正在导入…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('heading', { name: '选择要导入的照片' })).toBeVisible()
    const overlay = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]')
    if (!overlay) throw new Error('测试夹具缺少对话框遮罩')
    fireEvent.pointerDown(overlay)
    fireEvent.click(overlay)
    expect(screen.getByRole('heading', { name: '选择要导入的照片' })).toBeVisible()
    expect(platform.assets.releaseCandidates).not.toHaveBeenCalled()

    await act(async () => {
      importing.resolve({ assets: [], duplicateAssetIds: [], skipped: [] })
      await importing.promise
    })
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: '选择要导入的照片' })).not.toBeInTheDocument()
    )
    await importIdle
    expect(hasPendingAssetImports()).toBe(false)
    expect(platform.assets.releaseCandidates).toHaveBeenCalledWith('session-1')
  })

  it('导入失败时保留候选与重试上下文', async () => {
    openDocument(0)
    vi.mocked(platform.assets.pickCandidates).mockResolvedValueOnce(
      candidateSession([
        { id: 'candidate-1', fileName: '可重试.jpg', byteSize: 1, previewUrl: 'blob:retry' }
      ])
    )
    vi.mocked(platform.assets.importCandidates).mockRejectedValueOnce(new Error('写入失败'))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    await screen.findByRole('heading', { name: '选择要导入的照片' })
    fireEvent.click(screen.getByRole('checkbox', { name: '选择 可重试.jpg' }))
    fireEvent.click(screen.getByRole('button', { name: '导入所选 1 张' }))

    await waitFor(() => expect(screen.getByRole('button', { name: '导入所选 1 张' })).toBeEnabled())
    expect(screen.getByRole('alert')).toHaveTextContent('写入失败')
    expect(screen.getByText('可重试.jpg')).toBeVisible()
    expect(platform.assets.releaseCandidates).not.toHaveBeenCalled()
  })

  it('缺失素材显示重新定位入口并在恢复后清除缺失状态', async () => {
    const document = openDocument(1)
    useStudioStore.getState().markAssetMissing('asset-1')
    vi.mocked(platform.assets.relink).mockResolvedValueOnce(asset(1))
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '重新定位 照片 1.jpg' }))

    await waitFor(() => expect(platform.assets.relink).toHaveBeenCalledWith(document.id, 'asset-1'))
    expect(useStudioStore.getState().missingAssetIds).not.toContain('asset-1')
  })

  it('全屏素材使用可聚焦模态，Esc 退出后恢复触发按钮焦点', async () => {
    openDocument(2)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '全屏查看素材' }))

    const dialog = screen.getByRole('dialog', { name: '项目素材' })
    expect(dialog).toBeVisible()
    const exitButton = within(dialog).getByRole('button', { name: '退出全屏' })
    expect(exitButton).toBeVisible()
    expect(within(dialog).getByText('2 张')).toBeVisible()
    await waitFor(() => expect(exitButton).toHaveFocus())

    fireEvent.keyDown(document, { key: 'Escape' })
    const expandButton = screen.getByRole('button', { name: '全屏查看素材' })
    expect(screen.queryByRole('dialog', { name: '项目素材' })).not.toBeInTheDocument()
    await waitFor(() => expect(expandButton).toHaveFocus())
  })

  it('查看大图打开全屏预览，可左右翻看并关闭', () => {
    openDocument(2)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '查看大图 照片 1.jpg' }))

    const first = screen.getByRole('dialog', { name: '查看大图：照片 1.jpg' })
    expect(first).toBeVisible()
    expect(within(first).getByText('照片 1.jpg')).toBeVisible()
    expect(screen.getByText('1 / 2')).toBeVisible()

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    const second = screen.getByRole('dialog', { name: '查看大图：照片 2.jpg' })
    expect(second).toBeVisible()
    expect(screen.getByText('2 / 2')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '上一张' }))
    expect(screen.getByRole('dialog', { name: '查看大图：照片 1.jpg' })).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /查看大图/ })).not.toBeInTheDocument()
  })

  it('全屏预览中可直接把照片添加到当前页', () => {
    openDocument(1)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '查看大图 照片 1.jpg' }))
    fireEvent.click(screen.getByRole('button', { name: '添加到当前页' }))

    const state = useStudioStore.getState()
    const cover = state.document?.pages[0]
    expect(cover?.blocks).toHaveLength(4)
    expect(cover?.blocks.at(-1)).toMatchObject({ type: 'image', assetId: 'asset-1' })
  })

  it('导入候选对话框可查看大图，Esc 只关预览不关对话框', async () => {
    openDocument(0)
    vi.mocked(platform.assets.pickCandidates).mockResolvedValueOnce(
      candidateSession([
        { id: 'candidate-1', fileName: '第一张.jpg', byteSize: 1024, previewUrl: 'blob:1' },
        { id: 'candidate-2', fileName: '第二张.jpg', byteSize: 2048, previewUrl: 'blob:2' }
      ])
    )
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))
    await screen.findByRole('heading', { name: '选择要导入的照片' })

    fireEvent.click(screen.getByRole('button', { name: '查看大图 第一张.jpg' }))
    expect(screen.getByRole('dialog', { name: '查看大图：第一张.jpg' })).toBeVisible()
    expect(screen.getByText('1 / 2')).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: /查看大图/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '选择要导入的照片' })).toBeVisible()
    expect(platform.assets.releaseCandidates).not.toHaveBeenCalled()
  })
})
