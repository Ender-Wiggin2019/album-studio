import { createAlbumDocument, createRichTextDocument, type AssetRecord } from '@album-studio/common'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStudioStore } from '@/app/store'
import { PageLayoutPanel } from './page-layout-panel'

const asset: AssetRecord = {
  id: 'asset-1',
  fileName: '布局照片.jpg',
  contentHash: 'a'.repeat(64),
  mimeType: 'image/jpeg',
  byteSize: 1_024,
  width: 1_600,
  height: 1_200,
  importedAt: '2026-08-16T12:00:00.000Z'
}

describe('PageLayoutPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useStudioStore.getState().closeDocument()
    useStudioStore.getState().openDocument(
      createAlbumDocument({
        title: '布局测试',
        now: '2026-08-16T12:00:00.000Z',
        pageSpec: { presetId: 'widescreen-16-9', widthMm: 338.67, heightMm: 190.5 }
      })
    )
    const store = useStudioStore.getState()
    store.dispatch({ type: 'register-assets', assets: [asset] })
    store.dispatch({ type: 'add-page' })
    const page = useStudioStore.getState().document?.pages[1]
    if (!page) throw new Error('内容页夹具不完整')
    store.dispatch({
      type: 'add-block',
      pageId: page.id,
      block: { type: 'image', assetId: asset.id }
    })
    store.dispatch({
      type: 'add-block',
      pageId: page.id,
      block: { type: 'rich-text', document: createRichTextDocument('图文故事') }
    })
    store.dispatch({
      type: 'add-block',
      pageId: page.id,
      block: {
        type: 'decoration',
        decoration: { kind: 'sticker', resourceId: 'travel-tag' }
      }
    })
    store.selectPage(page.id)
  })

  it('显示真实图/文槽、物理尺寸和严格数量匹配', () => {
    const { container } = render(<PageLayoutPanel />)

    expect(screen.getByText(/338\.67 × 190\.5 mm/)).toBeVisible()
    expect(screen.getByRole('button', { name: /图文焦点/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /焦点大图/ })).toBeDisabled()
    const mixedButton = screen.getByRole('button', { name: /图文焦点/ })
    expect(mixedButton.querySelector('.lucide-image')).toBeInTheDocument()
    expect(mixedButton.querySelector('.lucide-type')).toBeInTheDocument()
    expect(container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0)
  })

  it('一次应用混合布局，并逐字段保留 DecorationBlock', async () => {
    const user = userEvent.setup()
    const beforePage = useStudioStore.getState().document?.pages[1]
    const decorationBefore = structuredClone(
      beforePage?.blocks.find((block) => block.type === 'decoration')
    )
    const revisionBefore = useStudioStore.getState().document?.revision ?? 0
    const historyBefore = useStudioStore.getState().history.past.length
    render(<PageLayoutPanel />)

    await user.click(screen.getByRole('button', { name: /图文焦点/ }))

    const state = useStudioStore.getState()
    const afterPage = state.document?.pages[1]
    expect(afterPage?.layoutId).toBe('image-text-focus')
    expect(afterPage?.blocks.find((block) => block.type === 'decoration')).toEqual(decorationBefore)
    expect(state.document?.revision).toBe(revisionBefore + 1)
    expect(state.history.past).toHaveLength(historyBefore + 1)
  })
})
