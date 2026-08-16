import {
  createAlbumDocument,
  createContentPage,
  createDecorationBlock,
  type AlbumPage,
  type BlockTransform
} from '@album-studio/common'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudioStore } from '@/app/store'
import { BlockPlacementDragDropProvider } from '@/features/block-placement/drag-drop-provider'
import { ComponentLibraryPanel } from './component-library-panel'

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

const SELECTED_TRANSFORM = {
  x: 0.67,
  y: 0.13,
  width: 0.19,
  height: 0.26,
  rotationDeg: -11
} as const satisfies BlockTransform

function selectedContentPage(): AlbumPage {
  const page = useStudioStore
    .getState()
    .document?.pages.find((candidate) => candidate.id === 'page-content')
  if (!page) throw new Error('测试内容页不存在')
  return page
}

function renderPanel(): ReturnType<typeof render> {
  return render(
    <BlockPlacementDragDropProvider>
      <ComponentLibraryPanel />
    </BlockPlacementDragDropProvider>
  )
}

describe('ComponentLibraryPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useStudioStore.getState().closeDocument()
    const document = createAlbumDocument({
      title: '组件库测试',
      now: '2026-08-16T12:00:00.000Z'
    })
    const page = createContentPage(() => 'page-content')
    page.blocks.push(
      createDecorationBlock(
        { kind: 'icon', resourceId: 'heart', color: '#305a73' },
        SELECTED_TRANSFORM,
        () => 'block-decoration'
      )
    )
    document.pages.push(page)
    useStudioStore.getState().openDocument(document)
    useStudioStore.getState().selectBlock(page.id, 'block-decoration')
  })

  it('点击同类图标只替换装饰内容，保留 Block 几何、颜色与图层', () => {
    const before = selectedContentPage()
    const beforeBlock = before.blocks[0]
    const beforeRevision = useStudioStore.getState().document?.revision

    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: '相机' }))

    const after = selectedContentPage()
    expect(after.blocks).toHaveLength(1)
    expect(after.blocks[0]).toMatchObject({
      id: beforeBlock?.id,
      type: 'decoration',
      transform: SELECTED_TRANSFORM,
      decoration: { kind: 'icon', resourceId: 'camera', color: '#305a73' }
    })
    expect(after.blocks.indexOf(after.blocks[0]!)).toBe(0)
    expect(useStudioStore.getState().document?.revision).toBe((beforeRevision ?? 0) + 1)
    expect(useStudioStore.getState().history.past).toHaveLength(1)
  })

  it('点击不同类资源会在页面中央新建 Block，文字也共用同一放置路径', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: '和纸胶带' }))
    let page = selectedContentPage()
    expect(page.blocks).toHaveLength(2)
    expect(page.blocks[1]).toMatchObject({
      type: 'decoration',
      decoration: { kind: 'sticker', resourceId: 'washi-tape' },
      transform: { x: 0.42, y: 0.38, width: 0.16, height: 0.24, rotationDeg: 0 }
    })

    fireEvent.click(screen.getByRole('button', { name: '添加文字' }))
    page = selectedContentPage()
    expect(page.blocks).toHaveLength(3)
    expect(page.blocks[2]).toMatchObject({
      type: 'rich-text',
      transform: { x: 0.25, y: 0.36, width: 0.5, height: 0.28, rotationDeg: 0 }
    })
    expect(page.blocks[2]?.type === 'rich-text' ? page.blocks[2].document : null).toMatchObject({
      root: {
        children: [{ children: [{ text: '在这里写下故事' }] }]
      }
    })
  })

  it('按稳定 ID 或中文名称搜索并保持图标、贴纸分组', async () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: '图标' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '贴纸' })).toBeVisible()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索组件' }), {
      target: { value: 'camera' }
    })

    await waitFor(() => expect(screen.getByRole('button', { name: '相机' })).toBeVisible())
    expect(screen.queryByRole('button', { name: '爱心' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '贴纸' })).not.toBeInTheDocument()
  })
})
