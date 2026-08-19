import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useProcessedImageSource,
  type ProcessedImageSourceState
} from './use-processed-image-source'

const SOURCE = 'album-asset://project/asset?quality=preview'
const DEBOUNCE_MS = 20

function useProcessed(
  requestKey: string,
  process: (source: string) => Promise<string>,
  active = true,
  taskClass: 'interactive' | 'full-resolution' = 'interactive'
): ProcessedImageSourceState {
  const input = {
    source: SOURCE,
    active,
    requestKey,
    process,
    debounceMs: DEBOUNCE_MS,
    taskClass
  }
  return useProcessedImageSource(input)
}

async function startProcessing(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(DEBOUNCE_MS)
    await Promise.resolve()
  })
}

describe('useProcessedImageSource shared derivatives', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('URL', {
      ...URL,
      revokeObjectURL: vi.fn()
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('computes one derivative for concurrent subscribers and revokes it after the last release', async () => {
    let finish: ((source: string) => void) | undefined
    const process = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        })
    )
    const first = renderHook(() => useProcessed('asset|preview|2048|clarity:0.5', process))
    const second = renderHook(() => useProcessed('asset|preview|2048|clarity:0.5', process))

    await startProcessing()
    expect(process).toHaveBeenCalledTimes(1)

    await act(async () => finish?.('blob:shared-derivative'))
    expect(first.result.current).toMatchObject({
      source: 'blob:shared-derivative',
      pending: false,
      failed: false
    })
    expect(second.result.current).toMatchObject({
      source: 'blob:shared-derivative',
      pending: false,
      failed: false
    })

    first.unmount()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    second.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:shared-derivative')
  })

  it('deduplicates subscribers that join at different points in the shared debounce window', async () => {
    const process = vi.fn().mockResolvedValue('blob:staggered-derivative')
    const first = renderHook(() => useProcessed('asset|preview|2048|clarity:0.5', process))
    await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS / 2))
    const second = renderHook(() => useProcessed('asset|preview|2048|clarity:0.5', process))

    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_MS / 2)
      await Promise.resolve()
    })
    expect(process).toHaveBeenCalledTimes(1)
    expect(second.result.current.source).toBe('blob:staggered-derivative')

    first.unmount()
    await act(async () => vi.advanceTimersByTime(DEBOUNCE_MS / 2))
    expect(process).toHaveBeenCalledTimes(1)
    expect(second.result.current.source).toBe('blob:staggered-derivative')
    second.unmount()
  })

  it('keeps preview 2048 and print full derivatives in separate cache entries', async () => {
    const previewProcess = vi.fn().mockResolvedValue('blob:preview-2048')
    const printProcess = vi.fn().mockResolvedValue('blob:print-full')
    const preview = renderHook(() => useProcessed('asset|preview|2048|clarity:0.5', previewProcess))
    const print = renderHook(() => useProcessed('asset|print|full|clarity:0.5', printProcess))

    await startProcessing()

    expect(previewProcess).toHaveBeenCalledTimes(1)
    expect(printProcess).toHaveBeenCalledTimes(1)
    expect(preview.result.current.source).toBe('blob:preview-2048')
    expect(print.result.current.source).toBe('blob:print-full')

    preview.unmount()
    print.unmount()
  })

  it('shares the original processing error with every subscriber', async () => {
    const processingError = new Error('Canvas 2D unavailable')
    const process = vi.fn().mockRejectedValue(processingError)
    const first = renderHook(() => useProcessed('asset|preview|2048|clarity:0.5', process))
    const second = renderHook(() => useProcessed('asset|preview|2048|clarity:0.5', process))

    await startProcessing()

    expect(process).toHaveBeenCalledTimes(1)
    expect(first.result.current).toMatchObject({
      source: SOURCE,
      pending: false,
      failed: true,
      error: processingError
    })
    expect(second.result.current).toMatchObject({
      source: SOURCE,
      pending: false,
      failed: true,
      error: processingError
    })

    first.unmount()
    second.unmount()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('renders the original source before releasing a cached derivative when processing is disabled', async () => {
    const process = vi
      .fn()
      .mockResolvedValueOnce('blob:enhanced')
      .mockResolvedValueOnce('blob:enhanced-again')
    const hook = renderHook(
      ({ active }: { active: boolean }) =>
        useProcessed('asset|preview|2048|clarity:0.5', process, active),
      { initialProps: { active: true } }
    )
    await startProcessing()
    expect(hook.result.current.source).toBe('blob:enhanced')

    hook.rerender({ active: false })

    expect(hook.result.current).toMatchObject({ source: SOURCE, pending: false, failed: false })
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:enhanced')

    hook.rerender({ active: true })
    expect(hook.result.current).toMatchObject({ source: SOURCE, pending: true, failed: false })
    await startProcessing()
    expect(hook.result.current.source).toBe('blob:enhanced-again')
    hook.unmount()
  })

  it('revokes a late derivative when every subscriber leaves while processing is pending', async () => {
    let finish: ((source: string) => void) | undefined
    const process = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        })
    )
    const hook = renderHook(() => useProcessed('asset|preview|2048|clarity:0.5', process))
    await startProcessing()

    hook.unmount()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    await act(async () => finish?.('blob:late-derivative'))
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late-derivative')
  })

  it('runs different full-resolution derivatives one at a time', async () => {
    let finishFirst: ((source: string) => void) | undefined
    const firstProcess = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishFirst = resolve
        })
    )
    const secondProcess = vi.fn().mockResolvedValue('blob:second-full')
    const first = renderHook(() =>
      useProcessed('queue-order-a|print|full', firstProcess, true, 'full-resolution')
    )
    const second = renderHook(() =>
      useProcessed('queue-order-b|print|full', secondProcess, true, 'full-resolution')
    )

    await startProcessing()
    expect(firstProcess).toHaveBeenCalledTimes(1)
    expect(secondProcess).not.toHaveBeenCalled()

    await act(async () => finishFirst?.('blob:first-full'))
    expect(secondProcess).toHaveBeenCalledTimes(1)
    expect(first.result.current.source).toBe('blob:first-full')
    expect(second.result.current.source).toBe('blob:second-full')
    first.unmount()
    second.unmount()
  })

  it('cancels a queued full-resolution derivative when its final reference leaves', async () => {
    let finishRunning: ((source: string) => void) | undefined
    const runningProcess = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishRunning = resolve
        })
    )
    const queuedProcess = vi.fn().mockResolvedValue('blob:must-not-exist')
    const running = renderHook(() =>
      useProcessed('queue-cancel-running|print|full', runningProcess, true, 'full-resolution')
    )
    const queued = renderHook(() =>
      useProcessed('queue-cancel-queued|print|full', queuedProcess, true, 'full-resolution')
    )

    await startProcessing()
    expect(runningProcess).toHaveBeenCalledTimes(1)
    expect(queuedProcess).not.toHaveBeenCalled()
    queued.unmount()

    await act(async () => finishRunning?.('blob:running-full'))
    expect(queuedProcess).not.toHaveBeenCalled()
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:must-not-exist')
    running.unmount()
  })

  it('does not make interactive preview work wait for a full-resolution derivative', async () => {
    let finishFull: ((source: string) => void) | undefined
    const fullProcess = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finishFull = resolve
        })
    )
    const previewProcess = vi.fn().mockResolvedValue('blob:interactive-preview')
    const full = renderHook(() =>
      useProcessed('queue-interactive-full|print|full', fullProcess, true, 'full-resolution')
    )
    const preview = renderHook(() =>
      useProcessed('queue-interactive-preview|preview|2048', previewProcess, true, 'interactive')
    )

    await startProcessing()
    expect(fullProcess).toHaveBeenCalledTimes(1)
    expect(previewProcess).toHaveBeenCalledTimes(1)
    expect(preview.result.current.source).toBe('blob:interactive-preview')

    await act(async () => finishFull?.('blob:full'))
    full.unmount()
    preview.unmount()
  })

  it('still deduplicates identical full-resolution subscribers', async () => {
    const process = vi.fn().mockResolvedValue('blob:shared-full')
    const first = renderHook(() =>
      useProcessed('queue-dedupe|print|full', process, true, 'full-resolution')
    )
    const second = renderHook(() =>
      useProcessed('queue-dedupe|print|full', process, true, 'full-resolution')
    )

    await startProcessing()
    expect(process).toHaveBeenCalledTimes(1)
    expect(first.result.current.source).toBe('blob:shared-full')
    expect(second.result.current.source).toBe('blob:shared-full')
    first.unmount()
    second.unmount()
  })

  it('continues the full-resolution queue after a processing failure', async () => {
    const processingError = new Error('full processing failed')
    const failedProcess = vi.fn().mockRejectedValue(processingError)
    const nextProcess = vi.fn().mockResolvedValue('blob:after-failure')
    const failed = renderHook(() =>
      useProcessed('queue-failure-first|print|full', failedProcess, true, 'full-resolution')
    )
    const next = renderHook(() =>
      useProcessed('queue-failure-next|print|full', nextProcess, true, 'full-resolution')
    )

    await startProcessing()

    expect(failedProcess).toHaveBeenCalledTimes(1)
    expect(nextProcess).toHaveBeenCalledTimes(1)
    expect(failed.result.current).toMatchObject({ failed: true, error: processingError })
    expect(next.result.current.source).toBe('blob:after-failure')
    failed.unmount()
    next.unmount()
  })
})
