import { createAlbumDocument } from '@album-studio/common'
import { describe, expect, it, vi } from 'vitest'
import type { RecentStudioProject } from './studio-platform'
import { resumeLastProject } from './resume-last-project'

function recentItem(overrides: Partial<RecentStudioProject> = {}): RecentStudioProject {
  return {
    id: 'p1',
    title: '相册一',
    themeId: 'journal',
    updatedAt: '2026-08-18T00:00:00.000Z',
    missing: false,
    ...overrides
  }
}

function openDocument(title: string): ReturnType<typeof createAlbumDocument> {
  return createAlbumDocument({ title, themeId: 'journal', now: '2026-08-18T00:00:00.000Z' })
}

describe('resumeLastProject', () => {
  it('打开最近项目中第一个仍然存在的相册', async () => {
    const open = vi.fn(async (id: string) => openDocument(id))
    const document = await resumeLastProject({
      listRecent: vi.fn(async () => [recentItem({ id: 'p1' }), recentItem({ id: 'p2' })]),
      open
    })
    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('p1')
    expect(document?.title).toBe('p1')
  })

  it('跳过已移动的相册，打开下一个仍然存在的', async () => {
    const open = vi.fn(async (id: string) => openDocument(id))
    const document = await resumeLastProject({
      listRecent: vi.fn(async () => [
        recentItem({ id: 'p1', missing: true }),
        recentItem({ id: 'p2' })
      ]),
      open
    })
    expect(open).toHaveBeenCalledWith('p2')
    expect(document?.title).toBe('p2')
  })

  it('没有可用相册时返回 null 且不打开任何项目', async () => {
    const open = vi.fn(async (id: string) => openDocument(id))
    const document = await resumeLastProject({
      listRecent: vi.fn(async () => [
        recentItem({ id: 'p1', missing: true }),
        recentItem({ id: 'p2', missing: true })
      ]),
      open
    })
    expect(document).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })

  it('最近项目列表为空时返回 null', async () => {
    const open = vi.fn(async (id: string) => openDocument(id))
    const document = await resumeLastProject({ listRecent: vi.fn(async () => []), open })
    expect(document).toBeNull()
    expect(open).not.toHaveBeenCalled()
  })
})
