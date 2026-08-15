import { createContentPage, createEmptyProject } from '@album-studio/common'
import { afterEach, describe, expect, it } from 'vitest'
import { useStudioStore } from './store'

function ids(): () => string {
  let value = 0
  return () => `test-${++value}`
}

afterEach(() => useStudioStore.getState().closeProject())

describe('studio history', () => {
  it('keeps revisions monotonic across undo and redo', () => {
    const project = createEmptyProject(
      { title: '测试相册', now: '2026-08-15T12:00:00.000Z' },
      ids()
    )
    useStudioStore.getState().openProject({ projectPath: '/tmp/test.album-project', project })
    useStudioStore.getState().setTheme('film')
    const changedRevision = useStudioStore.getState().project?.revision ?? 0
    useStudioStore.getState().undo()
    const undoRevision = useStudioStore.getState().project?.revision ?? 0
    useStudioStore.getState().redo()
    const redoRevision = useStudioStore.getState().project?.revision ?? 0

    expect(changedRevision).toBe(1)
    expect(undoRevision).toBe(2)
    expect(redoRevision).toBe(3)
    expect(useStudioStore.getState().project?.themeId).toBe('film')
  })

  it('moves photo content without moving layout frames', () => {
    const makeId = ids()
    const project = createEmptyProject(
      { title: '移动照片', now: '2026-08-15T12:00:00.000Z' },
      makeId
    )
    const firstPage = createContentPage(['asset-a', 'asset-b'], makeId)
    const secondPage = createContentPage([null], makeId)
    project.pages.push(firstPage, secondPage)
    const firstFrame = structuredClone(firstPage.slots[0].frame)
    const secondFrame = structuredClone(firstPage.slots[1].frame)
    useStudioStore.getState().openProject({ projectPath: '/tmp/move.album-project', project })

    useStudioStore.getState().movePhotoWithinPage(firstPage.id, firstPage.slots[0].id, 1)
    let current = useStudioStore.getState().project
    let movedPage = current?.pages[1]
    expect(movedPage?.kind === 'content' && movedPage.slots.map((slot) => slot.assetId)).toEqual([
      'asset-b',
      'asset-a'
    ])
    expect(movedPage?.kind === 'content' && movedPage.slots[0].frame).toEqual(firstFrame)
    expect(movedPage?.kind === 'content' && movedPage.slots[1].frame).toEqual(secondFrame)

    useStudioStore.getState().movePhotoToPage(firstPage.id, firstPage.slots[1].id, 1)
    current = useStudioStore.getState().project
    movedPage = current?.pages[1]
    const targetPage = current?.pages[2]
    expect(movedPage?.kind === 'content' && movedPage.slots[1].assetId).toBeNull()
    expect(targetPage?.kind === 'content' && targetPage.slots[0].assetId).toBe('asset-a')
  })

  it('never drops occupied placements when changing layouts', () => {
    const makeId = ids()
    const project = createEmptyProject(
      { title: '安全布局', now: '2026-08-15T12:00:00.000Z' },
      makeId
    )
    const page = createContentPage(['asset-a', null, 'asset-b', null], makeId)
    project.pages.push(page)
    useStudioStore.getState().openProject({ projectPath: '/tmp/layout.album-project', project })

    useStudioStore.getState().changePageLayout(page.id, 1)
    expect(useStudioStore.getState().project?.revision).toBe(0)
    useStudioStore.getState().changePageLayout(page.id, 2)
    const changed = useStudioStore.getState().project?.pages[1]
    expect(changed?.kind === 'content' && changed.slots.map((slot) => slot.assetId)).toEqual([
      'asset-a',
      'asset-b'
    ])
  })

  it('fills current empty slots before creating new pages', () => {
    const makeId = ids()
    const project = createEmptyProject(
      { title: '填充空位', now: '2026-08-15T12:00:00.000Z' },
      makeId
    )
    const page = createContentPage(['asset-a', null], makeId)
    project.pages.push(page)
    useStudioStore.getState().openProject({ projectPath: '/tmp/fill.album-project', project })
    useStudioStore.getState().selectPage(page.id)
    useStudioStore.getState().setAssetSelection(['asset-b', 'asset-c'])

    useStudioStore.getState().addSelectedAssetsToAlbum('auto')
    const pages = useStudioStore.getState().project?.pages
    expect(pages?.[1].kind === 'content' && pages[1].slots[1].assetId).toBe('asset-b')
    expect(pages?.[2].kind === 'content' && pages[2].slots[0].assetId).toBe('asset-c')
  })
})
