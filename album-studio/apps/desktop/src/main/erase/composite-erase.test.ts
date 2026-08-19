import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  compositeErase,
  decodeSrgb,
  decodeSrgba,
  expandBinaryMask,
  resizeBinaryMask
} from './inference-service'

describe('compositeErase', () => {
  it('小遮罩内部完整使用修补结果，不会把原图混回后只显得变淡', () => {
    const original = Uint8Array.from([200, 180, 160, 77])
    const model = Uint8Array.from([40, 60, 80])
    const mask = Uint8Array.from([255])

    const result = compositeErase(original, model, mask, 1, 1)

    expect([...result]).toEqual([40, 60, 80, 77])
  })

  it('遮罩外 RGB 逐字节保留，遮罩内外都保留原图 alpha', () => {
    const original = Uint8Array.from([10, 20, 30, 0, 40, 50, 60, 96])
    const model = Uint8Array.from([110, 120, 130, 140, 150, 160])
    const mask = Uint8Array.from([0, 255])

    const result = compositeErase(original, model, mask, 2, 1)

    expect([...result]).toEqual([10, 20, 30, 0, 140, 150, 160, 96])
  })

  it('使用 128 作为二值遮罩边界，不把插值产生的微弱灰度当成要消除的区域', () => {
    const original = Uint8Array.from([10, 20, 30, 10, 40, 50, 60, 20, 70, 80, 90, 30])
    const model = Uint8Array.from([110, 120, 130, 140, 150, 160, 170, 180, 190])
    const mask = Uint8Array.from([1, 127, 128])

    const result = compositeErase(original, model, mask, 3, 1)

    expect([...result]).toEqual([10, 20, 30, 10, 40, 50, 60, 20, 170, 180, 190, 30])
  })

  it('不用外环平均色改写模型已经给出的局部颜色', () => {
    const original = Uint8Array.from([220, 220, 220, 255, 20, 30, 40, 128, 220, 220, 220, 255])
    const model = Uint8Array.from([220, 220, 220, 60, 100, 70, 220, 220, 220])
    const mask = Uint8Array.from([0, 255, 0])

    const result = compositeErase(original, model, mask, 3, 1)

    expect([...result.subarray(4, 8)]).toEqual([60, 100, 70, 128])
  })
})

describe('resizeBinaryMask', () => {
  it('缩小后仍是 0/1 二值遮罩，不把 Lanczos 光晕扩大为模型洞区', async () => {
    const width = 100
    const height = 100
    const mask = new Uint8Array(width * height)
    for (let y = 40; y < 60; y++) {
      for (let x = 40; x < 60; x++) mask[y * width + x] = 255
    }

    const resized = await resizeBinaryMask(mask, width, height, 17, 17)

    expect([...new Set(resized)]).toEqual([0, 1])
    expect(resized.reduce((sum, value) => sum + value, 0)).toBe(9)
  })
})

describe('expandBinaryMask', () => {
  it('用硬边界扩张前景，不产生会混合原图的灰度边缘', async () => {
    const width = 9
    const height = 9
    const mask = new Uint8Array(width * height)
    mask[4 * width + 4] = 255

    const expanded = await expandBinaryMask(mask, width, height, 2)

    expect([...new Set(expanded)]).toEqual([0, 255])
    expect(expanded.reduce((sum, value) => sum + (value > 0 ? 1 : 0), 0)).toBe(25)
  })

  it('仅扩张模型输入，最终硬合成仍遵守原始遮罩边界', async () => {
    const width = 3
    const height = 3
    const mask = new Uint8Array(width * height)
    mask[4] = 255
    const expandedModelMask = await expandBinaryMask(mask, width, height, 1)
    const original = new Uint8Array(width * height * 4).fill(10)
    const model = new Uint8Array(width * height * 3).fill(200)

    const result = compositeErase(original, model, mask, width, height)

    expect(expandedModelMask[3]).toBe(255)
    expect([...result.subarray(3 * 4, 3 * 4 + 4)]).toEqual([10, 10, 10, 10])
    expect([...result.subarray(4 * 4, 4 * 4 + 4)]).toEqual([200, 200, 200, 10])
  })
})

describe('decodeSrgb', () => {
  it('统一输出 sRGB 三通道像素，不把 RGBA 按 RGB 错位读取', async () => {
    const rgba = Buffer.from([255, 0, 0, 128, 0, 255, 0, 64])
    const png = await sharp(rgba, { raw: { width: 2, height: 1, channels: 4 } })
      .png()
      .toBuffer()

    const rgb = await decodeSrgb(png, 2, 1)

    expect([...rgb]).toEqual([255, 0, 0, 0, 255, 0])
  })
})

describe('decodeSrgba', () => {
  it('解码带 alpha 的原图时保留每个像素的透明度', async () => {
    const rgba = Buffer.from([255, 0, 0, 0, 0, 255, 0, 96])
    const png = await sharp(rgba, { raw: { width: 2, height: 1, channels: 4 } })
      .png()
      .toBuffer()

    const decoded = await decodeSrgba(png, 2, 1)

    expect([decoded[3], decoded[7]]).toEqual([0, 96])
  })
})
