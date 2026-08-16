import { createAlbumDocument, PAGE_SPEC_PRESETS } from '@album-studio/common'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { useStudioStore } from '@/app/store'
import { ProjectsHome } from './projects-home'

function platform(): StudioPlatform {
  return {
    kind: 'web',
    capabilities: new Set(['folder-import']),
    projects: {
      listRecent: vi.fn(async () => []),
      create: vi.fn(async (input) =>
        createAlbumDocument({ ...input, now: '2026-08-16T00:00:00.000Z' })
      ),
      chooseAndOpen: vi.fn(async () => null),
      open: vi.fn(async () => {
        throw new Error('测试不应打开项目')
      }),
      save: vi.fn(async (document) => ({
        revision: document.revision,
        savedAt: document.updatedAt
      }))
    },
    assets: {
      import: vi.fn(async () => null),
      relink: vi.fn(async () => null),
      getSource: vi.fn(async () => ''),
      releaseSource: vi.fn()
    },
    export: { pdf: vi.fn(async () => null) },
    lifecycle: {
      onCloseRequest: vi.fn(() => () => undefined),
      closeReady: vi.fn(async () => undefined)
    }
  }
}

describe('ProjectsHome page size selection', () => {
  beforeEach(() => useStudioStore.getState().closeDocument())

  it('defaults to A4 and forwards the selected physical preset when creating', async () => {
    const studioPlatform = platform()
    const user = userEvent.setup()
    render(
      <StudioPlatformProvider platform={studioPlatform}>
        <ProjectsHome />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '新建相册' }))
    expect(screen.getByRole('radio', { name: /A4 横向/ })).toHaveAttribute('data-state', 'on')

    await user.click(screen.getByRole('radio', { name: /12 寸方形/ }))
    await user.click(screen.getByRole('button', { name: '创建相册' }))

    await waitFor(() =>
      expect(studioPlatform.projects.create).toHaveBeenCalledWith({
        title: '我的新相册',
        themeId: 'journal',
        pageSpec: PAGE_SPEC_PRESETS[1]
      })
    )
    expect(useStudioStore.getState().document?.pageSpec).toEqual(PAGE_SPEC_PRESETS[1])
  })
})
