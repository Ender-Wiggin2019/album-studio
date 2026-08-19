import { act, renderHook } from '@testing-library/react'
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
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('passes through the original source when enhancement is disabled', () => {
    const { result } = renderHook(() =>
      useBeautifiedSource(SOURCE, { beautySmooth: 0, beautyWhiten: 0, clarity: 0 })
    )
    expect(result.current).toEqual({ source: SOURCE, failed: false })
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
    expect(result.current.source).toBe('blob:beautified')
  })

  it('returns no source while the resource is still loading', () => {
    const { result } = renderHook(() => useBeautifiedSource(null, BEAUTY))
    expect(result.current).toEqual({ source: null, failed: false })
  })

  it('debounces parameter changes and renders the beautified blob URL', async () => {
    mockedBeautify.mockResolvedValue('blob:beautified')

    const { result } = renderHook(() => useBeautifiedSource(SOURCE, BEAUTY))
    expect(mockedBeautify).not.toHaveBeenCalled()

    await flushBeauty()
    expect(mockedBeautify).toHaveBeenCalledWith(SOURCE, BEAUTY, undefined)
    expect(result.current.source).toBe('blob:beautified')
    expect(result.current.failed).toBe(false)
  })

  it('keeps the original URL when processing fails', async () => {
    mockedBeautify.mockRejectedValue(new Error('canvas unavailable'))

    const { result } = renderHook(() => useBeautifiedSource(SOURCE, BEAUTY))
    await flushBeauty()

    expect(result.current).toEqual({ source: SOURCE, failed: false })
  })

  it('releases the previous blob URL when parameters change', async () => {
    mockedBeautify.mockResolvedValue('blob:beautified')

    const { result, rerender } = renderHook(
      ({ beauty }: { beauty: EnhanceParams }) => useBeautifiedSource(SOURCE, beauty),
      { initialProps: { beauty: BEAUTY } }
    )
    await flushBeauty()
    expect(result.current.source).toBe('blob:beautified')

    rerender({ beauty: { beautySmooth: 0.8, beautyWhiten: 0.2, clarity: 0 } })
    await flushBeauty()

    expect(mockedBeautify).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:beautified')
    expect(result.current.source).toBe('blob:beautified')
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
    expect(result.current).toEqual({ source: SOURCE, failed: false })
    expect(mockedBeautify).toHaveBeenCalledTimes(1)
  })
})
