import { afterEach, describe, expect, it, vi } from 'vitest'
import { editImageSource, type EditSourceParams } from './edit-image-source'

const PARAMS: EditSourceParams = {
  beautySmooth: 0,
  beautyWhiten: 0,
  clarity: 0,
  rotationDeg: 0,
  flipX: false,
  flipY: false
}

describe('editImageSource', () => {
  function stubCanvas(): {
    canvas: HTMLCanvasElement
    context: {
      drawImage: ReturnType<typeof vi.fn>
      getImageData: ReturnType<typeof vi.fn>
      putImageData: ReturnType<typeof vi.fn>
      translate: ReturnType<typeof vi.fn>
      rotate: ReturnType<typeof vi.fn>
      scale: ReturnType<typeof vi.fn>
    }
  } {
    const imageData = {
      data: new Uint8ClampedArray(2 * 2 * 4).fill(200),
      width: 2,
      height: 2
    }
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => imageData),
      putImageData: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn()
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: (blob: Blob | null) => void) =>
        callback(new Blob(['edit'], { type: 'image/webp' }))
      )
    } as unknown as HTMLCanvasElement
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:edited'), revokeObjectURL: vi.fn() })
    vi.stubGlobal('document', {
      ...document,
      createElement: vi.fn(() => canvas)
    })
    return { canvas, context }
  }

  function stubBitmap(width = 2, height = 2): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image']), { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width, height, close: vi.fn() }))
    )
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the original URL unchanged when all parameters are default', async () => {
    await expect(editImageSource('album-asset://project/p/a?v=1', PARAMS)).resolves.toBe(
      'album-asset://project/p/a?v=1'
    )
  })

  it('rotates and flips into the rotated bounding box canvas', async () => {
    const { canvas, context } = stubCanvas()
    stubBitmap(4, 3)
    const rotated: EditSourceParams = { ...PARAMS, rotationDeg: 90, flipX: true }

    const result = await editImageSource('album-asset://project/p/a?v=1', rotated)

    expect(result).toBe('blob:edited')
    // 90° 旋转后包围盒为 3×4，画布按它创建
    expect(canvas.width).toBe(3)
    expect(canvas.height).toBe(4)
    // 变换顺序与 computeCropStyle 一致：先翻转、后旋转
    expect(context.translate).toHaveBeenCalledWith(1.5, 2)
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2)
    expect(context.scale).toHaveBeenCalledWith(-1, 1)
    expect(context.drawImage).toHaveBeenCalledTimes(1)
    expect(URL.createObjectURL).toHaveBeenCalled()
  })

  it('applies beauty pixels together with rotation in one pass', async () => {
    const { context } = stubCanvas()
    stubBitmap(2, 2)
    const params: EditSourceParams = { ...PARAMS, beautySmooth: 0.5, rotationDeg: 45 }

    const result = await editImageSource('album-asset://project/p/a?v=1', params)

    expect(result).toBe('blob:edited')
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 3, 3)
    expect(context.putImageData).toHaveBeenCalledTimes(1)
  })

  it('degrades to the original URL when canvas 2d is unavailable', async () => {
    stubBitmap(2, 2)
    vi.stubGlobal('document', {
      ...document,
      createElement: vi.fn(() => ({ getContext: vi.fn(() => null) }))
    })

    await expect(
      editImageSource('album-asset://project/p/a?v=1', { ...PARAMS, rotationDeg: 30 })
    ).resolves.toBe('album-asset://project/p/a?v=1')
  })

  it('degrades to the original URL when the source cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))

    await expect(
      editImageSource('album-asset://project/p/a?v=1', { ...PARAMS, flipY: true })
    ).resolves.toBe('album-asset://project/p/a?v=1')
  })
})
