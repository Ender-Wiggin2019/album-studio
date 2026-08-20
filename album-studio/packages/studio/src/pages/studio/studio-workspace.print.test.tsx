import { createAlbumDocument } from '@album-studio/common'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import { useStudioStore } from '@/app/store'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PrintBookReadyResult } from '@/features/canvas/album-page-view'
import { PRINT_READINESS_TIMEOUT_MS } from './print-readiness'
import { StudioWorkspace } from './studio-workspace'

vi.mock('@/features/block-placement/drag-drop-provider', () => ({
  BlockPlacementDragDropProvider: ({ children }: { children: ReactNode }) => children
}))

vi.mock('@/features/canvas/editor-workspace', () => ({
  EditorWorkspace: () => <div data-testid="editor-workspace" />
}))

vi.mock('@/features/preview/preview-workspace', () => ({
  PreviewWorkspace: () => <div />
}))

vi.mock('@/features/image-edit/photo-edit-workspace', () => ({
  PhotoEditWorkspace: () => <div />
}))

vi.mock('@/features/image-edit/erase-people-workspace', () => ({
  ErasePeopleWorkspace: () => <div />
}))

vi.mock('@/features/canvas/album-page-view', () => ({
  AlbumPageView: () => <div />,
  PrintBook: ({ onReady }: { onReady?: (result: PrintBookReadyResult) => void }) => (
    <button
      type="button"
      data-testid="print-book"
      onClick={() => onReady?.({ totalImages: 1, fallbackCount: 0 })}
    >
      打印树就绪
    </button>
  )
}))

function platform(pdf: ReturnType<typeof vi.fn>): StudioPlatform {
  return {
    kind: 'desktop',
    capabilities: new Set(),
    projects: {
      listRecent: vi.fn(),
      create: vi.fn(),
      chooseAndOpen: vi.fn(),
      open: vi.fn(),
      save: vi.fn()
    },
    assets: {
      pickCandidates: vi.fn(),
      importCandidates: vi.fn(),
      releaseCandidates: vi.fn(),
      relink: vi.fn(),
      getSource: vi.fn(),
      releaseSource: vi.fn()
    },
    export: { pdf },
    imageErase: { detect: vi.fn(), apply: vi.fn() },
    lifecycle: { onCloseRequest: vi.fn(), closeReady: vi.fn() }
  } as unknown as StudioPlatform
}

afterEach(() => {
  cleanup()
  useStudioStore.getState().closeDocument()
  vi.useRealTimers()
})

describe('StudioWorkspace branding', () => {
  it('shows the compact core logo in the editor header', () => {
    useStudioStore.getState().openDocument(createAlbumDocument({ title: '品牌测试' }))

    render(
      <StudioPlatformProvider platform={platform(vi.fn())}>
        <TooltipProvider>
          <StudioWorkspace />
        </TooltipProvider>
      </StudioPlatformProvider>
    )

    expect(screen.getByRole('img', { name: '咔宝' })).toHaveAttribute('width', '32')
    expect(screen.queryByText('自由画布 · Everything is a Block')).not.toBeInTheDocument()
  })
})

describe('StudioWorkspace print preparation', () => {
  it('does not call the platform exporter until the mounted PrintBook reports ready', async () => {
    const pdf = vi.fn().mockResolvedValue({ displayName: '测试.pdf' })
    const document = createAlbumDocument({ title: '打印屏障测试' })
    useStudioStore.getState().openDocument(document)
    useStudioStore
      .getState()
      .connectPersistence(
        vi.fn().mockResolvedValue({ revision: document.revision, savedAt: document.updatedAt })
      )

    render(
      <StudioPlatformProvider platform={platform(pdf)}>
        <TooltipProvider>
          <StudioWorkspace />
        </TooltipProvider>
      </StudioPlatformProvider>
    )

    fireEvent.click(await screen.findByRole('button', { name: '导出 PDF' }))
    const printBook = await screen.findByTestId('print-book')
    await new Promise((resolve) => window.setTimeout(resolve, 150))
    expect(pdf).not.toHaveBeenCalled()

    fireEvent.click(printBook)
    await waitFor(() => expect(pdf).toHaveBeenCalledWith(document))
  })

  it('aborts instead of exporting an unfinished tree after the deadlock timeout', async () => {
    vi.useFakeTimers()
    const pdf = vi.fn().mockResolvedValue({ displayName: '测试.pdf' })
    const document = createAlbumDocument({ title: '超时测试' })
    useStudioStore.getState().openDocument(document)
    useStudioStore
      .getState()
      .connectPersistence(
        vi.fn().mockResolvedValue({ revision: document.revision, savedAt: document.updatedAt })
      )

    render(
      <StudioPlatformProvider platform={platform(pdf)}>
        <TooltipProvider>
          <StudioWorkspace />
        </TooltipProvider>
      </StudioPlatformProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '导出 PDF' }))
    await act(async () => undefined)
    expect(screen.getByTestId('print-book')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(PRINT_READINESS_TIMEOUT_MS))

    expect(pdf).not.toHaveBeenCalled()
    expect(screen.getByText('部分图片处理超时，请重试导出。')).toBeVisible()
  })
})
