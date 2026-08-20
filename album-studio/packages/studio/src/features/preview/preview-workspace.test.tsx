import { PAGE_SPEC_PRESETS, createAlbumDocument } from '@album-studio/common'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudioStore } from '@/app/store'
import { PreviewWorkspace } from './preview-workspace'

const scrollIntoView = vi.fn()

function mockReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' && matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
}

function finishAnimation(element: HTMLElement): void {
  fireEvent(element, new Event('webkitAnimationEnd', { bubbles: true }))
}

function openPreview({ portrait = false }: { portrait?: boolean } = {}): void {
  const pageSpec = portrait
    ? PAGE_SPEC_PRESETS.find((preset) => preset.widthMm < preset.heightMm)
    : undefined
  if (portrait && !pageSpec) throw new Error('测试夹具缺少竖向页面规格')
  const store = useStudioStore.getState()
  store.closeDocument()
  store.openDocument(
    createAlbumDocument({
      title: '书本预览测试',
      now: '2026-08-19T12:00:00.000Z',
      pageSpec
    })
  )
  store.dispatch({ type: 'add-page' })
  store.dispatch({ type: 'add-page' })
  store.dispatch({ type: 'add-page' })
  store.setExclusiveWorkspace('preview')
}

describe('PreviewWorkspace', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView
    })
    scrollIntoView.mockClear()
    mockReducedMotion(false)
    openPreview()
  })

  afterEach(() => {
    cleanup()
    useStudioStore.getState().closeDocument()
  })

  it('默认以闭合封面进入双页书本，并按纸张正反面翻到首个跨页', async () => {
    const user = userEvent.setup()
    const pages = useStudioStore.getState().document?.pages
    if (!pages) throw new Error('测试夹具缺少页面')
    const { container } = render(<PreviewWorkspace />)

    const workspace = screen.getByRole('region', { name: '整册预览' })
    const book = screen.getByTestId('preview-book')
    expect(workspace).toHaveAttribute('data-preview-mode', 'double')
    expect(book).toHaveAttribute('data-closed', 'true')
    expect(book.querySelector('[data-preview-page-index="0"]')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '下一页' }))

    const turningSheet = container.querySelector<HTMLElement>('.preview-turn-sheet')
    expect(workspace).toHaveAttribute('data-preview-state', 'flipping')
    expect(turningSheet).toHaveAttribute('data-direction', 'forward')
    expect(
      turningSheet?.querySelector('.preview-turn-front[data-preview-page-index="0"]')
    ).toBeInTheDocument()
    expect(
      turningSheet?.querySelector('.preview-turn-back[data-preview-page-index="1"]')
    ).toBeInTheDocument()
    if (!turningSheet) throw new Error('翻页纸张未渲染')
    finishAnimation(turningSheet)

    await waitFor(() => expect(workspace).toHaveAttribute('data-preview-state', 'idle'))
    expect(book).not.toHaveAttribute('data-closed')
    expect(book.querySelector('[data-preview-page-index="1"]')).toBeInTheDocument()
    expect(book.querySelector('[data-preview-page-index="2"]')).toBeInTheDocument()
    expect(useStudioStore.getState().selectedPageId).toBe(pages[1]?.id)

    await user.click(screen.getByRole('button', { name: '下一页' }))
    const lastSheet = container.querySelector<HTMLElement>('.preview-turn-sheet')
    if (!lastSheet) throw new Error('末页翻页纸张未渲染')
    finishAnimation(lastSheet)
    expect(book.querySelector('[data-preview-page-index="3"]')).toBeInTheDocument()
    expect(book.querySelector('.preview-blank-page')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '上一页' }))
    const backwardSheet = container.querySelector<HTMLElement>('.preview-turn-sheet')
    expect(backwardSheet).toHaveAttribute('data-direction', 'backward')
    if (!backwardSheet) throw new Error('向前翻页纸张未渲染')
    finishAnimation(backwardSheet)
  })

  it('单页/双页切换保留当前页，缩略图可跳到包含该页的跨页', async () => {
    const user = userEvent.setup()
    const pages = useStudioStore.getState().document?.pages
    if (!pages) throw new Error('测试夹具缺少页面')
    const { container } = render(<PreviewWorkspace />)

    await user.click(screen.getByRole('radio', { name: '单页' }))
    expect(screen.getByTestId('preview-book')).toHaveAttribute('data-preview-mode', 'single')
    scrollIntoView.mockClear()
    await user.click(screen.getByRole('button', { name: '第 2 页' }))
    const singleTurn = container.querySelector<HTMLElement>('.preview-turn-sheet')
    if (!singleTurn) throw new Error('单页跳转未触发翻页')
    finishAnimation(singleTurn)
    await waitFor(() => expect(useStudioStore.getState().selectedPageId).toBe(pages[2]?.id))
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest'
    })

    await user.click(screen.getByRole('radio', { name: '双页' }))
    const book = screen.getByTestId('preview-book')
    expect(book.querySelector('[data-preview-page-index="1"]')).toBeInTheDocument()
    expect(book.querySelector('[data-preview-page-index="2"]')).toBeInTheDocument()
  })

  it('竖向页面把缩略图轨道放在左侧，并支持方向键翻页与 Esc 退出', () => {
    openPreview({ portrait: true })
    const { container } = render(<PreviewWorkspace />)

    expect(screen.getByRole('region', { name: '整册预览' })).toHaveAttribute(
      'data-page-orientation',
      'portrait'
    )
    expect(screen.getByRole('navigation', { name: '预览页面' })).toHaveAttribute(
      'data-placement',
      'left'
    )

    const coverThumbnail = screen.getByRole('button', { name: '封面' })
    coverThumbnail.focus()
    fireEvent.keyDown(coverThumbnail, { key: 'ArrowRight' })
    const turningSheet = container.querySelector<HTMLElement>('.preview-turn-sheet')
    if (!turningSheet) throw new Error('方向键未触发翻页')
    finishAnimation(turningSheet)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(useStudioStore.getState().exclusiveWorkspace).toBeNull()
  })

  it('减少动态效果时直接切换页面，不进入翻页中间态', async () => {
    cleanup()
    mockReducedMotion(true)
    openPreview()
    const user = userEvent.setup()
    const { container } = render(<PreviewWorkspace />)

    await user.click(screen.getByRole('button', { name: '下一页' }))

    expect(container.querySelector('.preview-turn-sheet')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: '整册预览' })).toHaveAttribute(
      'data-preview-state',
      'idle'
    )
    expect(
      screen.getByTestId('preview-book').querySelector('[data-preview-page-index="1"]')
    ).toBeInTheDocument()
  })
})
