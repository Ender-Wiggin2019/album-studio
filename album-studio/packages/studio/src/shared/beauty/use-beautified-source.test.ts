import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnhanceParams } from './beautify-image-source'
import { useBeautifiedSource } from './use-beautified-source'

vi.mock('./beautify-image-source', () => ({
  beautifyImageSource: vi.fn()
}))

import { beautifyImageSource } from './beautify-image-source'

const mockedBeautify = vi.mocked(beautifyImageSource)

const BEAUTY: EnhanceParams = { beautySmooth: 0.4, beautyWhiten: 0.2, clarity: 0 }
const SOURCE = 'album-asset://project/p/a?v=1'

async function flushBeauty(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(120)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useBeautifiedSource', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockedBeautify.mockReset()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:created'),
      revokeObjectURL: vi.fn()
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('passes through the original source when enhancement is disabled', () => {
    const { result } = renderHook(() =>
      useBeautifiedSource(SOURCE, { beautySmooth: 0, beautyWhiten: 0, clarity: 0 })
    )
    expect(result.current).toEqual({ source: SOURCE, pending: false, failed: false })
    expect(mockedBeautify).not.toHaveBeenCalled()
  })

  it('processes clarity-only parameters after the debounce', async () => {
    mockedBeautify.mockResolvedValue('blob:beautified')

    const { result } = renderHook(() =>
      useBeautifiedSource(SOURCE, { beautySmooth: 0, beautyWhiten: 0, clarity: 0.5 })
    )
    await flushBeauty()

    expect(mockedBeautify).toHaveBeenCalledWith(
      SOURCE,
      { beautySmooth: 0, beautyWhiten: 0, clarity: 0.5 },
      undefined
    )
    expect(result.current).toEqual({ source: 'blob:beautified', pending: false, failed: false })
  })

  it('returns no source while the resource is still loading', () => {
    const { result } = renderHook(() => useBeautifiedSource(null, BEAUTY))
    expect(result.current).toEqual({ source: null, pending: false, failed: false })
  })

  it('debounces parameter changes and renders the beautified blob URL', async () => {
    mockedBeautify.mockResolvedValue('blob:beautified')

    const { result } = renderHook(() => useBeautifiedSource(SOURCE, BEAUTY))
    expect(mockedBeautify).not.toHaveBeenCalled()
    expect(result.current).toEqual({ source: SOURCE, pending: true, failed: false })

    await flushBeauty()
    expect(mockedBeautify).toHaveBeenCalledWith(SOURCE, BEAUTY, undefined)
    expect(result.current.source).toBe('blob:beautified')
    expect(result.current.failed).toBe(false)
  })

  it('falls back to the original URL and exposes processing failures', async () => {
    mockedBeautify.mockRejectedValue(new Error('canvas unavailable'))

    const { result } = renderHook(() => useBeautifiedSource(SOURCE, BEAUTY))
    await flushBeauty()

    expect(result.current).toEqual({
      source: SOURCE,
      pending: false,
      failed: true,
      error: expect.any(Error)
    })
  })

  it('releases the previous blob URL when parameters change', async () => {
    mockedBeautify.mockResolvedValueOnce('blob:first').mockResolvedValueOnce('blob:second')

    const { result, rerender } = renderHook(
      ({ beauty }: { beauty: EnhanceParams }) => useBeautifiedSource(SOURCE, beauty),
      { initialProps: { beauty: BEAUTY } }
    )
    await flushBeauty()
    expect(result.current.source).toBe('blob:first')

    rerender({ beauty: { beautySmooth: 0.8, beautyWhiten: 0.2, clarity: 0 } })
    expect(result.current).toEqual({ source: SOURCE, pending: true, failed: false })
    await flushBeauty()

    expect(mockedBeautify).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first')
    expect(result.current.source).toBe('blob:second')
  })

  it('does not start processing for zero-parameter edits after a prior render', async () => {
    mockedBeautify.mockResolvedValue('blob:beautified')

    const { result, rerender } = renderHook(
      ({ beauty }: { beauty: EnhanceParams }) => useBeautifiedSource(SOURCE, beauty),
      { initialProps: { beauty: BEAUTY } }
    )
    await flushBeauty()
    expect(result.current.source).toBe('blob:beautified')

    rerender({ beauty: { beautySmooth: 0, beautyWhiten: 0, clarity: 0 } })
    expect(result.current).toEqual({ source: SOURCE, pending: false, failed: false })
    expect(mockedBeautify).toHaveBeenCalledTimes(1)
  })

  it('serializes distinct full-resolution enhancement requests', async () => {
    let finishFirst: ((source: string) => void) | undefined
    mockedBeautify
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            finishFirst = resolve
          })
      )
      .mockResolvedValueOnce('blob:second-full')
    const first = renderHook(() => useBeautifiedSource(SOURCE, BEAUTY, 0, 'print-a'))
    const second = renderHook(() => useBeautifiedSource(SOURCE, BEAUTY, 0, 'print-b'))

    await flushBeauty()
    expect(mockedBeautify).toHaveBeenCalledTimes(1)

    await act(async () => finishFirst?.('blob:first-full'))
    expect(mockedBeautify).toHaveBeenCalledTimes(2)
    expect(first.result.current.source).toBe('blob:first-full')
    expect(second.result.current.source).toBe('blob:second-full')
  })

  it('allows a bounded preview enhancement to run while a full task is pending', async () => {
    let finishFull: ((source: string) => void) | undefined
    mockedBeautify.mockImplementation((_source, _params, maxEdge) => {
      if (maxEdge === 0) {
        return new Promise<string>((resolve) => {
          finishFull = resolve
        })
      }
      return Promise.resolve('blob:preview')
    })
    const full = renderHook(() => useBeautifiedSource(SOURCE, BEAUTY, 0, 'print'))
    const preview = renderHook(() => useBeautifiedSource(SOURCE, BEAUTY, 2048, 'preview'))

    await flushBeauty()
    expect(mockedBeautify).toHaveBeenCalledTimes(2)
    expect(preview.result.current.source).toBe('blob:preview')
    expect(full.result.current.pending).toBe(true)

    await act(async () => finishFull?.('blob:full'))
  })
})
