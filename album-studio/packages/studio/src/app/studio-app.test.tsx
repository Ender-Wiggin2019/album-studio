import { createAlbumDocument } from '@album-studio/common'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StudioPlatform } from './platform/studio-platform'
import { StudioPlatformProvider } from './platform/studio-platform-provider'
import { trackAssetImport } from './pending-asset-imports'
import { useStudioStore } from './store'
import { StudioApp } from './studio-app'

vi.mock('@/app/platform/resume-last-project', () => ({
  resumeLastProject: vi.fn(async () => null)
}))

vi.mock('@/pages/studio/studio-workspace', () => ({
  StudioWorkspace: () => <div>工作区</div>
}))

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

describe('StudioApp close transaction', () => {
  afterEach(() => {
    cleanup()
    useStudioStore.getState().closeDocument()
  })

  it('blocks unload and desktop close until an asset import transaction finishes', async () => {
    let requestClose: (() => void) | undefined
    const closeReady = vi.fn(async () => undefined)
    const document = createAlbumDocument({ title: '关闭屏障测试' })
    const platform = {
      kind: 'desktop',
      capabilities: new Set(),
      projects: {
        listRecent: vi.fn(async () => []),
        save: vi.fn(async () => ({ revision: document.revision, savedAt: document.updatedAt }))
      },
      lifecycle: {
        onCloseRequest: vi.fn((listener: () => void) => {
          requestClose = listener
          return () => undefined
        }),
        closeReady
      }
    } as unknown as StudioPlatform
    useStudioStore.getState().openDocument(document)
    const pending = deferred()
    const importing = trackAssetImport(async () => pending.promise)

    render(
      <StudioPlatformProvider platform={platform}>
        <StudioApp />
      </StudioPlatformProvider>
    )
    await waitFor(() => expect(requestClose).toBeTypeOf('function'))

    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)

    act(() => requestClose?.())
    await Promise.resolve()
    expect(closeReady).not.toHaveBeenCalled()

    await act(async () => {
      pending.resolve()
      await importing
    })
    await waitFor(() => expect(closeReady).toHaveBeenCalledWith({ ok: true }))
  })
})
