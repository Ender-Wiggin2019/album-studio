import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditSourceParams } from './edit-image-source'
import { useEditSource } from './use-edit-source'

vi.mock('./edit-image-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./edit-image-source')>()),
  editImageSource: vi.fn()
}))

import { editImageSource } from './edit-image-source'

const mockedEdit = vi.mocked(editImageSource)

const PARAMS: EditSourceParams = {
  beautySmooth: 0.4,
  beautyWhiten: 0.2,
  clarity: 0,
  rotationDeg: 12,
  flipX: false,
  flipY: false
}
const SOURCE = 'album-asset://project/p/a?v=1'

async function flushEdit(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(120)
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useEditSource', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockedEdit.mockReset()
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

  it('passes through the original source when every parameter is default', () => {
    const { result } = renderHook(() =>
      useEditSource(SOURCE, {
        beautySmooth: 0,
        beautyWhiten: 0,
        clarity: 0,
        rotationDeg: 0,
        flipX: false,
        flipY: false
      })
    )
    expect(result.current).toEqual({ source: SOURCE, failed: false })
    expect(mockedEdit).not.toHaveBeenCalled()
  })

  it('processes rotation-only changes after the debounce', async () => {
    mockedEdit.mockResolvedValue('blob:edited')

    const { result } = renderHook(() =>
      useEditSource(SOURCE, { ...PARAMS, beautySmooth: 0, beautyWhiten: 0, clarity: 0 })
    )
    await flushEdit()

    expect(mockedEdit).toHaveBeenCalledWith(
      SOURCE,
      { ...PARAMS, beautySmooth: 0, beautyWhiten: 0, clarity: 0 },
      undefined
    )
    expect(result.current.source).toBe('blob:edited')
  })

  it('returns no source while the resource is still loading', () => {
    const { result } = renderHook(() => useEditSource(null, PARAMS))
    expect(result.current).toEqual({ source: null, failed: false })
  })

  it('debounces parameter changes and renders the processed blob URL', async () => {
    mockedEdit.mockResolvedValue('blob:edited')

    const { result } = renderHook(() => useEditSource(SOURCE, PARAMS))
    expect(mockedEdit).not.toHaveBeenCalled()

    await flushEdit()
    expect(mockedEdit).toHaveBeenCalledWith(SOURCE, PARAMS, undefined)
    expect(result.current.source).toBe('blob:edited')
    expect(result.current.failed).toBe(false)
  })

  it('keeps the original URL when processing fails', async () => {
    mockedEdit.mockRejectedValue(new Error('canvas unavailable'))

    const { result } = renderHook(() => useEditSource(SOURCE, PARAMS))
    await flushEdit()

    expect(result.current).toEqual({ source: SOURCE, failed: false })
  })

  it('releases the previous blob URL when rotation changes', async () => {
    mockedEdit.mockResolvedValue('blob:edited')

    const { result, rerender } = renderHook(
      ({ params }: { params: EditSourceParams }) => useEditSource(SOURCE, params),
      { initialProps: { params: PARAMS } }
    )
    await flushEdit()
    expect(result.current.source).toBe('blob:edited')

    rerender({ params: { ...PARAMS, rotationDeg: 90 } })
    await flushEdit()

    expect(mockedEdit).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:edited')
    expect(result.current.source).toBe('blob:edited')
  })

  it('does not start processing for default parameters after a prior render', async () => {
    mockedEdit.mockResolvedValue('blob:edited')

    const { result, rerender } = renderHook(
      ({ params }: { params: EditSourceParams }) => useEditSource(SOURCE, params),
      { initialProps: { params: PARAMS } }
    )
    await flushEdit()
    expect(result.current.source).toBe('blob:edited')

    rerender({
      params: {
        beautySmooth: 0,
        beautyWhiten: 0,
        clarity: 0,
        rotationDeg: 0,
        flipX: false,
        flipY: false
      }
    })
    expect(result.current).toEqual({ source: SOURCE, failed: false })
    expect(mockedEdit).toHaveBeenCalledTimes(1)
  })
})
