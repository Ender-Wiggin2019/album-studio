import { describe, expect, it } from 'vitest'
import { coverImageDerivativeSize, printImageDerivativeSize, printImageTargetSize } from '../src'

const A4_PORTRAIT = {
  presetId: 'a4-portrait',
  widthMm: 210,
  heightMm: 297
} as const

describe('print image derivative geometry', () => {
  it('竖图以 cover 语义生成 A4 竖版 300 DPI 派生图', () => {
    expect(
      printImageDerivativeSize({
        sourceSize: { width: 4960, height: 7016 },
        pageSpec: A4_PORTRAIT,
        dpi: 300
      })
    ).toEqual({ width: 2480, height: 3508 })
  })

  it('裁剪区会增加 cover 所需的原图派生尺寸', () => {
    const full = printImageDerivativeSize({
      sourceSize: { width: 4000, height: 3000 },
      pageSpec: A4_PORTRAIT,
      dpi: 300,
      usage: { widthFraction: 0.25, heightFraction: 0.25 }
    })
    const cropped = printImageDerivativeSize({
      sourceSize: { width: 4000, height: 3000 },
      pageSpec: A4_PORTRAIT,
      dpi: 300,
      usage: { widthFraction: 0.25, heightFraction: 0.25 },
      crop: {
        area: { x: 25, y: 0, width: 50, height: 100 },
        rotationDeg: 0,
        flipX: false,
        flipY: false
      }
    })

    expect(full).toEqual({ width: 1169, height: 877 })
    expect(cropped).toEqual({ width: 1240, height: 930 })
  })

  it('旋转后按包围盒上的裁剪区计算 cover 尺寸', () => {
    expect(
      printImageDerivativeSize({
        sourceSize: { width: 4000, height: 3000 },
        pageSpec: A4_PORTRAIT,
        dpi: 300,
        usage: { widthFraction: 0.25, heightFraction: 0.25 },
        crop: {
          area: { x: 25, y: 0, width: 50, height: 100 },
          rotationDeg: 90,
          flipX: false,
          flipY: false
        }
      })
    ).toEqual({ width: 1653, height: 1240 })
  })

  it('不放大小图，且极端 cover 的总像素不超过整页', () => {
    expect(
      coverImageDerivativeSize({
        sourceSize: { width: 800, height: 600 },
        viewportSize: { width: 2480, height: 3508 }
      })
    ).toEqual({ width: 800, height: 600 })

    const page = printImageTargetSize({ pageSpec: A4_PORTRAIT, dpi: 300 })
    const output = printImageDerivativeSize({
      sourceSize: { width: 8000, height: 2000 },
      pageSpec: A4_PORTRAIT,
      dpi: 300
    })
    expect(output.width * output.height).toBeLessThanOrEqual(page.width * page.height)
  })
})
