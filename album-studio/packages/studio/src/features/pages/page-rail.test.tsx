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

  it('内容页直接以缩略图作为拖拽面，封面不参与排序', () => {
    const { container, queryByRole } = render(<PageRail />)

    const items = container.querySelectorAll<HTMLElement>('.page-rail-item')
    const thumbnails = container.querySelectorAll<HTMLElement>('.page-thumbnail')
    expect(items).toHaveLength(3)
    expect(thumbnails).toHaveLength(3)
    expect(items[0]).not.toHaveAttribute('role')
    expect(items[0]).not.toHaveAttribute('tabindex')
    expect(items[0]).not.toHaveAttribute('aria-roledescription')
    expect(thumbnails[0]).not.toHaveAttribute('data-dnd-handle')
    expect(thumbnails[1]).toHaveAttribute('data-dnd-handle')
    expect(queryByRole('button', { name: '拖拽排序第 1 页' })).not.toBeInTheDocument()
  })

  it('可从任意预览后插入页面并选中新页', async () => {
    const user = userEvent.setup()
    const pagesBefore = useStudioStore.getState().document?.pages
    const coverId = pagesBefore?.[0]?.id
    if (!pagesBefore || !coverId) throw new Error('测试夹具缺少封面')
    const { getByRole } = render(<PageRail />)

    await user.click(getByRole('button', { name: '在封面后添加页面' }))

    const state = useStudioStore.getState()
    const pagesAfter = state.document?.pages
    expect(pagesAfter).toHaveLength(4)
    expect(pagesAfter?.[0]?.id).toBe(coverId)
    expect(pagesAfter?.[1]?.id).not.toBe(pagesBefore[1]?.id)
    expect(state.selectedPageId).toBe(pagesAfter?.[1]?.id)
  })

  it('向页面栏暴露竖向页面规格，供缩略图使用紧凑尺寸', () => {
    useStudioStore.getState().openDocument(
      createAlbumDocument({
        title: '竖排页面测试',
        now: '2026-08-16T12:00:00.000Z',
        pageSpec: { presetId: 'a4-portrait', widthMm: 210, heightMm: 297 }
      })
    )
    const { getByLabelText } = render(<PageRail />)

    expect(getByLabelText('相册页面')).toHaveAttribute('data-page-orientation', 'portrait')
  })

  it('只标记画布图片当前命中的跨页目标', () => {
    const target = useStudioStore.getState().document?.pages[2]
    if (!target) throw new Error('测试夹具缺少跨页目标')
    const { container } = render(<PageRail blockDropTargetPageId={target.id} />)

    expect(container.querySelectorAll('[data-block-drop-target="true"]')).toHaveLength(1)
    expect(container.querySelector(`[data-page-id="${target.id}"]`)).toHaveAttribute(
      'data-block-drop-target',
      'true'
    )
  })
})
