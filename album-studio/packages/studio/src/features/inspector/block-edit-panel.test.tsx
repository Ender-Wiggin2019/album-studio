import { createAlbumDocument, type AssetRecord } from '@album-studio/common'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

    render(<BlockEditPanel />)
    expect(screen.getByRole('button', { name: '裁剪与美化' })).toBeVisible()
    expect(screen.getByRole('button', { name: '复制 Block' })).toBeVisible()

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

    const view = render(<BlockEditPanel />)
    await user.type(screen.getByLabelText('照片说明'), '切换前未失焦的说明')
    view.unmount()

    const updated = useStudioStore
      .getState()
      .document?.pages[1].blocks.find((candidate) => candidate.id === block.id)
    expect(updated?.type).toBe('image')
    if (updated?.type === 'image') expect(updated.caption.text).toBe('切换前未失焦的说明')
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

    render(<BlockEditPanel />)
    expect(screen.getByLabelText('图标颜色')).toHaveValue('#a84835')
    await user.click(screen.getByRole('button', { name: '打开组件库' }))
    expect(useStudioStore.getState()).toMatchObject({
      selectedBlockId: block.id,
      rightPanelTab: 'components'
    })
  })
})
