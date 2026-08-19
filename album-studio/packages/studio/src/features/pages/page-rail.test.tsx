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

  it('在页面缩略图上按 Enter 只选择页面，不插入新页', async () => {
    const user = userEvent.setup()
    const pagesBefore = useStudioStore.getState().document?.pages
    const secondContent = pagesBefore?.[2]
    if (!secondContent) throw new Error('测试夹具缺少第二个内容页')
    const { container } = render(<PageRail />)

    const thumbnails = container.querySelectorAll<HTMLButtonElement>('.page-thumbnail')
    expect(thumbnails).toHaveLength(3)
    thumbnails[2].focus()
    await user.keyboard('{Enter}')

    const state = useStudioStore.getState()
    expect(state.document?.pages).toHaveLength(3)
    expect(state.selectedPageId).toBe(secondContent.id)
  })

  it('封面不注册为拖拽按钮', () => {
    const { container } = render(<PageRail />)

    const items = container.querySelectorAll<HTMLElement>('.page-rail-item')
    expect(items).toHaveLength(3)
    expect(items[0]).not.toHaveAttribute('role')
    expect(items[0]).not.toHaveAttribute('tabindex')
    expect(items[0]).not.toHaveAttribute('aria-roledescription')
    expect(items[0]?.querySelector('[data-dnd-handle]')).toBeNull()
    expect(items[1]?.querySelector('[data-dnd-handle]')).not.toBeNull()
  })
})
