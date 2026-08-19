import { createAlbumDocument } from '@album-studio/common'
import { cleanup, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStudioStore } from '@/app/store'
import { PageRail } from './page-rail'

describe('PageRail', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useStudioStore.getState().closeDocument()
    useStudioStore.getState().openDocument(
      createAlbumDocument({
        title: '页面测试',
        now: '2026-08-16T12:00:00.000Z'
      })
    )
    const store = useStudioStore.getState()
    store.dispatch({ type: 'add-page' })
    store.dispatch({ type: 'add-page' })
  })

  it('在页面缩略图上按 Enter 会在当前选中页后面插入新页并选中', async () => {
    const user = userEvent.setup()
    const pagesBefore = useStudioStore.getState().document?.pages
    const secondContent = pagesBefore?.[2]
    if (!secondContent) throw new Error('测试夹具缺少第二个内容页')
    const { container } = render(<PageRail />)

    const thumbnails = container.querySelectorAll<HTMLButtonElement>('.page-thumbnail')
    expect(thumbnails).toHaveLength(3)
    await user.click(thumbnails[2])
    await user.keyboard('{Enter}')

    const state = useStudioStore.getState()
    expect(state.document?.pages).toHaveLength(4)
    expect(state.document?.pages[2].id).toBe(secondContent.id)
    const inserted = state.document?.pages[3]
    expect(inserted?.kind).toBe('content')
    expect(state.selectedPageId).toBe(inserted?.id)
  })

  it('连续按 Enter 会依次插到最新页后面，而不是反复插到原选中页后面', async () => {
    const user = userEvent.setup()
    const pagesBefore = useStudioStore.getState().document?.pages
    const firstContent = pagesBefore?.[1]
    const lastBefore = pagesBefore?.[2]
    if (!firstContent || !lastBefore) throw new Error('测试夹具缺少内容页')
    const { container } = render(<PageRail />)

    const thumbnails = container.querySelectorAll<HTMLButtonElement>('.page-thumbnail')
    await user.click(thumbnails[1])
    await user.keyboard('{Enter}')
    await user.keyboard('{Enter}')

    const state = useStudioStore.getState()
    const pages = state.document?.pages
    expect(pages).toHaveLength(5)
    expect(pages?.[1].id).toBe(firstContent.id)
    expect(pages?.[2].kind).toBe('content')
    expect(pages?.[3].kind).toBe('content')
    expect(pages?.[4].id).toBe(lastBefore.id)
    expect(state.selectedPageId).toBe(pages?.[3].id)
  })
})
