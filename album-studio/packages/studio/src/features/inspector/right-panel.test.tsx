import { createAlbumDocument } from '@album-studio/common'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStudioStore } from '@/app/store'

vi.mock('@/features/assets/asset-library', () => ({
  ProjectAssetsPanel: () => <div>项目素材内容</div>
}))
vi.mock('@/features/components/component-library-panel', () => ({
  ComponentLibraryPanel: () => <div>组件内容</div>
}))
vi.mock('@/features/layout/page-layout-panel', () => ({
  PageLayoutPanel: () => <div>页面布局内容</div>
}))
vi.mock('./block-edit-panel', () => ({
  BlockEditPanel: () => <div>Block 编辑内容</div>
}))

import { RightPanel } from './right-panel'

describe('RightPanel', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useStudioStore.getState().closeDocument()
    useStudioStore
      .getState()
      .openDocument(createAlbumDocument({ title: '右栏测试', now: '2026-08-16T12:00:00.000Z' }))
  })

  it('常驻显示布局、素材、组件，只在选中 Block 后显示编辑', async () => {
    const user = userEvent.setup()
    const view = render(<RightPanel />)

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.queryByRole('tab', { name: /\u7f16辑/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /\u7ec4件/ }))
    expect(await screen.findByText('组件内容')).toBeVisible()

    const cover = useStudioStore.getState().document?.pages[0]
    const block = cover?.blocks[0]
    if (!cover || !block) throw new Error('封面 Block 夹具不完整')
    useStudioStore.getState().selectBlock(cover.id, block.id)
    view.rerender(<RightPanel />)

    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByRole('tab', { name: /\u7f16辑/ })).toHaveAttribute('data-state', 'active')
    expect(screen.getByText('Block 编辑内容')).toBeVisible()
  })

  it('从 Block 编辑切回常驻 Tab 时保留选中', async () => {
    const user = userEvent.setup()
    const cover = useStudioStore.getState().document?.pages[0]
    const block = cover?.blocks[0]
    if (!cover || !block) throw new Error('封面 Block 夹具不完整')
    useStudioStore.getState().selectBlock(cover.id, block.id)
    render(<RightPanel />)

    await user.click(screen.getByRole('tab', { name: /\u7d20材/ }))

    expect(screen.getByText('项目素材内容')).toBeVisible()
    expect(useStudioStore.getState()).toMatchObject({
      selectedBlockId: block.id,
      rightPanelTab: 'assets',
      lastPersistentPanelTab: 'assets'
    })
  })
})
