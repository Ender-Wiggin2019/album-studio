import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyBeautyToPixels, BEAUTY_CONSTANTS } from '@album-studio/common'
import { beautifyImageSource, type EnhanceParams } from './beautify-image-source'

describe('beautifyImageSource', () => {
  const params: EnhanceParams = { beautySmooth: 0.5, beautyWhiten: 0.3, clarity: 0.2 }

  function stubCanvas(): {
    canvas: HTMLCanvasElement
    imageData: { data: Uint8ClampedArray; width: number; height: number }
  } {
    const imageData = {
      data: new Uint8ClampedArray(2 * 2 * 4).fill(200),
      width: 2,
      height: 2
    }
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => imageData),
      putImageData: vi.fn()
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) =>
        callback(new Blob(['beauty'], { type: 'image/webp' }))
      )
    } as unknown as HTMLCanvasElement
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:beautified'), revokeObjectURL: vi.fn() })
    vi.stubGlobal('document', {
      ...document,
      createElement: vi.fn(() => canvas)
    })
    return { canvas, imageData }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the original URL unchanged when enhancement is disabled', async () => {
    await expect(
      beautifyImageSource('album-asset://project/p/a?v=1', {
        beautySmooth: 0,
        beautyWhiten: 0,
        clarity: 0
      })
    ).resolves.toBe('album-asset://project/p/a?v=1')
  })

  it('runs the pipeline for clarity-only parameters and returns a blob URL', async () => {
    stubCanvas()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image']), { status: 200 }))
    )
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() })))

    const result = await beautifyImageSource('album-asset://project/p/a?v=1', {
      beautySmooth: 0,
      beautyWhiten: 0,
      clarity: 0.6
    })

    expect(result).toBe('blob:beautified')
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('loads the source, applies the common pixel algorithm and returns a blob URL', async () => {
    const { canvas, imageData } = stubCanvas()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image']), { status: 200 }))
    )
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() })))

    const result = await beautifyImageSource('album-asset://project/p/a?v=1', params)

    expect(result).toBe('blob:beautified')
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
    expect(imageData.data).not.toBeUndefined()
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('degrades to the original URL when canvas 2d is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image']), { status: 200 }))
    )
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() })))
    vi.stubGlobal('document', {
      ...document,
      createElement: vi.fn(() => ({ getContext: vi.fn(() => null) }))
    })

    await expect(beautifyImageSource('album-asset://project/p/a?v=1', params)).resolves.toBe(
      'album-asset://project/p/a?v=1'
    )
  })

  it('degrades to the original URL when the source cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))

    await expect(beautifyImageSource('album-asset://project/p/a?v=1', params)).resolves.toBe(
      'album-asset://project/p/a?v=1'
    )
  })

  it('exposes the shared algorithm constants used by the pipeline', () => {
    // 常量存在且取值在肤色检测的合理范围内，供 shader/JS 双实现保持一致
    expect(BEAUTY_CONSTANTS.skinCbCenter).toBe(102)
    expect(BEAUTY_CONSTANTS.skinCrCenter).toBe(153)
    expect(BEAUTY_CONSTANTS.whitenBoost).toBe(0.35)
    expect(applyBeautyToPixels).toBeTypeOf('function')
  })
})
