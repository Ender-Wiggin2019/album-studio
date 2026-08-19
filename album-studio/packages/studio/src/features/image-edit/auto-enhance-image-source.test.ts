import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_IMAGE_CROP, type ImageCrop } from '@album-studio/common'
import { autoEnhanceImageSource } from './auto-enhance-image-source'

const FULL_CROP: ImageCrop = structuredClone(DEFAULT_IMAGE_CROP)

function opaqueSolidPixels(value: number, width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    pixels[offset] = value
    pixels[offset + 1] = value
    pixels[offset + 2] = value
    pixels[offset + 3] = 255
  }
  return pixels
}

function stubCanvas(
  pixelsForRegion: (width: number, height: number) => Uint8ClampedArray = (width, height) =>
    opaqueSolidPixels(60, width, height)
): {
  canvas: HTMLCanvasElement
  context: {
    drawImage: ReturnType<typeof vi.fn>
    getImageData: ReturnType<typeof vi.fn>
    translate: ReturnType<typeof vi.fn>
    rotate: ReturnType<typeof vi.fn>
    scale: ReturnType<typeof vi.fn>
  }
} {
  // getImageData 按请求区域返回真实尺寸的深灰像素（60/255 ≈ 0.235 欠曝）
  const context = {
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: pixelsForRegion(width, height),
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
      vi.fn(async () => new Response('image', { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close }) as unknown as ImageBitmap)
    )

    const result = await autoEnhanceImageSource('album-asset://project/p/a?v=1', FULL_CROP)

    // 分析图 60/255 ≈ 0.235 欠曝 → 提亮
    expect(result).not.toBeNull()
    expect(result!.brightness).toBeGreaterThan(1)
    expect(close).toHaveBeenCalled()
  })

  it('按当前裁剪框截取分析区域（缩放后坐标传给 getImageData）', async () => {
    const { context } = stubCanvas()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('image', { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() }) as unknown as ImageBitmap)
    )

    // 800×600 → 最长边 256 → 256×192；区域 10%,20% 起、50%×40% 大小
    await autoEnhanceImageSource('album-asset://project/p/a?v=1', {
      ...FULL_CROP,
      area: { x: 10, y: 20, width: 50, height: 40 }
    })

    expect(context.getImageData).toHaveBeenCalledWith(26, 38, 128, 77)
  })

  it('读取失败返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 404 }))
    )
    await expect(
      autoEnhanceImageSource('album-asset://project/p/a?v=1', FULL_CROP)
    ).resolves.toBeNull()
  })

  it('canvas 2d 不可用时返回 null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('image', { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() }) as unknown as ImageBitmap)
    )
    vi.stubGlobal('document', {
      ...document,
      createElement: vi.fn(() => ({ getContext: vi.fn(() => null) }))
    })
    await expect(
      autoEnhanceImageSource('album-asset://project/p/a?v=1', FULL_CROP)
    ).resolves.toBeNull()
  })

  it('非法裁剪区域降级为分析整张图', async () => {
    const { context } = stubCanvas()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('image', { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() }) as unknown as ImageBitmap)
    )

    await autoEnhanceImageSource('album-asset://project/p/a?v=1', {
      ...FULL_CROP,
      area: { x: 0, y: 0, width: 0, height: 0 }
    })

    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 100, 100)
  })

  it('先按当前旋转与翻转生成分析图，再读取裁剪区域', async () => {
    const { canvas, context } = stubCanvas()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('image', { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 400, height: 300, close: vi.fn() }) as unknown as ImageBitmap)
    )

    await autoEnhanceImageSource('album-asset://project/p/a?v=1', {
      area: { x: 0, y: 0, width: 100, height: 50 },
      rotationDeg: 90,
      flipX: true,
      flipY: false
    })

    expect(canvas.width).toBe(192)
    expect(canvas.height).toBe(256)
    expect(context.translate).toHaveBeenCalledWith(96, 128)
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2)
    expect(context.scale).toHaveBeenCalledWith(-1, 1)
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 192, 128)
  })

  it('透明 PNG 的无效背景不会被当成黑色误提亮', async () => {
    stubCanvas((width, height) => {
      const pixels = new Uint8ClampedArray(width * height * 4)
      const center = Math.floor((width * height) / 2) * 4
      pixels[center] = 128
      pixels[center + 1] = 128
      pixels[center + 2] = 128
      pixels[center + 3] = 255
      return pixels
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('image', { status: 200 }))
    )
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 2, height: 2, close: vi.fn() }) as unknown as ImageBitmap)
    )

    const result = await autoEnhanceImageSource('album-asset://project/p/a?v=1', FULL_CROP)

    expect(result?.brightness).toBe(1)
  })
})
