import { describe, expect, it } from 'vitest'
import { derivativeCanvasSize } from './browser-image-pipeline'

describe('browser image derivative sizing', () => {
  it('用 cover 而非 contain 生成打印图', () => {
    expect(
      derivativeCanvasSize(
        { width: 4000, height: 3000 },
        { width: 620, height: 877, quality: 0.92, fit: 'cover' }
      )
    ).toEqual({ width: 1169, height: 877 })
  })

  it('按旋转后裁剪区的 cover 需求保留像素', () => {
    expect(
      derivativeCanvasSize(
        { width: 4000, height: 3000 },
        {
          width: 620,
          height: 877,
          quality: 0.92,
          fit: 'cover',
          crop: {
            area: { x: 25, y: 0, width: 50, height: 100 },
            rotationDeg: 90,
            flipX: false,
            flipY: false
          },
          maximumPixels: 2480 * 3508
        }
      )
    ).toEqual({ width: 1653, height: 1240 })
  })

  it('预览派生图继续使用 contain 且不放大', () => {
    expect(
      derivativeCanvasSize(
        { width: 4000, height: 3000 },
        { width: 2048, height: 2048, quality: 0.86 }
      )
    ).toEqual({ width: 2048, height: 1536 })
    expect(
      derivativeCanvasSize(
        { width: 320, height: 240 },
        { width: 2048, height: 2048, quality: 0.86 }
      )
    ).toEqual({ width: 320, height: 240 })
  })
})
