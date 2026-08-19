import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CropArea } from '@album-studio/common'
import { autoEnhanceImageSource } from './auto-enhance-image-source'

const FULL_AREA: CropArea = { x: 0, y: 0, width: 100, height: 100 }

function stubCanvas(): {
  canvas: HTMLCanvasElement
  context: { drawImage: ReturnType<typeof vi.fn>; getImageData: ReturnType<typeof vi.fn> }
} {
  // getImageData 按请求区域返回真实尺寸的深灰像素（60/255 ≈ 0.235 欠曝）
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4).fill(60),
      width,
      height
    }))
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context)
  } as unknown as HTMLCanvasElement
  vi.stubGlobal('document', {
    ...document,
    createElement: vi.fn(() => canvas)
  })
  return { canvas, context }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('autoEnhanceImageSource', () => {
  it('读取原图并返回自动美化参数，且释放位图', async () => {
    stubCanvas()
    const close = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image']), { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close }) as unknown as ImageBitmap)
    )

    const result = await autoEnhanceImageSource('album-asset://project/p/a?v=1', FULL_AREA)

    // 分析图 60/255 ≈ 0.235 欠曝 → 提亮
    expect(result).not.toBeNull()
    expect(result!.brightness).toBeGreaterThan(1)
    expect(close).toHaveBeenCalled()
  })

  it('按当前裁剪框截取分析区域（缩放后坐标传给 getImageData）', async () => {
    const { context } = stubCanvas()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image']), { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() }) as unknown as ImageBitmap)
    )

    // 800×600 → 最长边 256 → 256×192；区域 10%,20% 起、50%×40% 大小
    await autoEnhanceImageSource('album-asset://project/p/a?v=1', {
      x: 10,
      y: 20,
      width: 50,
      height: 40
    })

    expect(context.getImageData).toHaveBeenCalledWith(26, 38, 128, 77)
  })

  it('读取失败返回 null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    await expect(autoEnhanceImageSource('album-asset://project/p/a?v=1', FULL_AREA)).resolves.toBeNull()
  })

  it('canvas 2d 不可用时返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image']), { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() }) as unknown as ImageBitmap)
    )
    vi.stubGlobal('document', {
      ...document,
      createElement: vi.fn(() => ({ getContext: vi.fn(() => null) }))
    })
    await expect(autoEnhanceImageSource('album-asset://project/p/a?v=1', FULL_AREA)).resolves.toBeNull()
  })

  it('非法裁剪区域降级为分析整张图', async () => {
    const { context } = stubCanvas()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['image']), { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() }) as unknown as ImageBitmap)
    )

    await autoEnhanceImageSource('album-asset://project/p/a?v=1', {
      x: 0,
      y: 0,
      width: 0,
      height: 0
    })

    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 100, 100)
  })
})
