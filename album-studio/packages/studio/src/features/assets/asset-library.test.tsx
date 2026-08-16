import {
  createAlbumDocument,
  createContentPage,
  type AlbumDocument,
  type AssetRecord
} from '@album-studio/common'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
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
    import: vi.fn(),
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

describe('ProjectAssetsPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useStudioStore.getState().closeDocument()
    vi.clearAllMocks()
  })

  it('单击在当前封面中央添加普通 ImageBlock，复选框只改批量选择', () => {
    openDocument(1)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '添加 照片 1.jpg 到当前页' }))

    let state = useStudioStore.getState()
    const cover = state.document?.pages[0]
    expect(cover?.blocks).toHaveLength(4)
    expect(cover?.blocks.at(-1)).toMatchObject({
      type: 'image',
      assetId: 'asset-1',
      transform: { width: 0.42, height: 0.55, rotationDeg: 0 }
    })
    expect(cover?.blocks.at(-1)?.transform.x).toBeCloseTo(0.29)
    expect(cover?.blocks.at(-1)?.transform.y).toBeCloseTo(0.225)
    expect(state.selectedAssetIds).toEqual([])

    fireEvent.click(screen.getByRole('checkbox', { name: '选择 照片 1.jpg' }))
    state = useStudioStore.getState()
    expect(state.selectedAssetIds).toEqual(['asset-1'])
    expect(state.document?.pages[0].blocks).toHaveLength(4)
  })

  it('批量添加到当前纯图内容页时匹配对应布局', () => {
    openDocument(2, true)
    useStudioStore.getState().selectPage('page-content')
    useStudioStore.getState().setAssetSelection(['asset-1', 'asset-2'])
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '批量添加' }))
    fireEvent.click(screen.getByRole('button', { name: /添加到当前页/ }))

    const state = useStudioStore.getState()
    const page = state.document?.pages.find((candidate) => candidate.id === 'page-content')
    expect(page?.layoutId).toBe('split-even')
    expect(page?.blocks.map((block) => (block.type === 'image' ? block.assetId : null))).toEqual([
      'asset-1',
      'asset-2'
    ])
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
    expect(pages[0]?.layoutId).toBe('contact-six')
    expect(pages[1]?.layoutId).toBe('focus')
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
    vi.mocked(platform.assets.import).mockResolvedValueOnce({
      assets: [],
      duplicateAssetIds: [],
      skipped: [{ fileName: '无法解码的超长中文照片文件名.jpg', reason: '图片编码损坏' }]
    })
    renderPanel()

    expect(screen.getByRole('heading', { name: '导入项目照片' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '选择照片' }))

    const failureSummary = await screen.findByText('1 个文件未导入 · 查看详情')
    expect(failureSummary).toBeVisible()
    fireEvent.click(failureSummary)
    expect(screen.getByText('无法解码的超长中文照片文件名.jpg：图片编码损坏')).toBeVisible()
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
})
