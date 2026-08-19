import { describe, expect, it } from 'vitest'
import { compositeErase } from './inference-service'

/** 4×4 场景：ring 像素只出现在 index 4；便于手算验证。 */
const width = 4
const height = 4

// mask：index 4 为 0（环带），5–7 为 255（内部），8 为 100（软边），其余 0
const mask = Uint8Array.from([0, 0, 0, 0, 0, 255, 255, 255, 100, 0, 0, 0, 0, 0, 0, 0])
// feather：index 4 羽化非零（遮罩外），5 为 128（边界），6–8 为 255，其余 0
const feather = Uint8Array.from([0, 0, 0, 0, 200, 128, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0])
// 原图：全像素 [100,120,140]
const original = Uint8Array.from({ length: width * height * 3 }, (_, i) => {
  const channel = i % 3
  return channel === 0 ? 100 : channel === 1 ? 120 : 140
})
// 模型：环带像素(4) [80,100,130]；核心像素(6,7) [90,100,110]；其余 [40,50,60]
const model = Uint8Array.from({ length: width * height * 3 }, (_, i) => {
  const pixel = Math.floor(i / 3)
  const channel = i % 3
  const base = pixel === 4 ? [80, 100, 130] : pixel === 6 || pixel === 7 ? [90, 100, 110] : [40, 50, 60]
  return base[channel]
})
// 颗粒关闭：blurredOriginal = original（高频残差为 0）
const blurredOriginal = Uint8Array.from(original)

describe('compositeErase', () => {
  it('遮罩外的像素 1:1 保留原图，即使羽化非零也不渗入模型输出', () => {
    const result = compositeErase(original, model, mask, feather, blurredOriginal, width, height)
    // index 4：mask=0 但 feather=200 —— 关键回归：模型输出不得作用到遮罩外
    for (const pixel of [0, 1, 2, 3, 4, 9, 10, 11, 12, 13, 14, 15]) {
      const o = pixel * 3
      expect(result[o]).toBe(100)
      expect(result[o + 1]).toBe(120)
      expect(result[o + 2]).toBe(140)
    }
  })

  it('遮罩内部使用模型输出，并按“环带原图 − 核心模型”均值差对齐颜色', () => {
    const result = compositeErase(original, model, mask, feather, blurredOriginal, width, height)
    // 偏移 = 环带原图均值 [100,120,140] − 核心模型均值 [90,100,110] = [10,20,30]
    // 内部像素(6,7)：alpha=1，输出 = 模型[90,100,110] + 偏移 = [100,120,140]
    for (const pixel of [6, 7]) {
      const o = pixel * 3
      expect(result[o]).toBe(100)
      expect(result[o + 1]).toBe(120)
      expect(result[o + 2]).toBe(140)
    }
  })

  it('边界像素按 min(羽化, 遮罩) 的 alpha 渐变合成', () => {
    const result = compositeErase(original, model, mask, feather, blurredOriginal, width, height)
    // index 5：mask=255, feather=128 → alpha=128/255≈0.502
    // filled = 模型[40,50,60] + 偏移[10,20,30] = [50,70,90]
    // output = round(orig*0.498 + filled*0.502) = [75, 95, 115]
    const o = 5 * 3
    expect(result[o]).toBe(75)
    expect(result[o + 1]).toBe(95)
    expect(result[o + 2]).toBe(115)
  })

  it('软边遮罩按遮罩值限制 alpha', () => {
    const result = compositeErase(original, model, mask, feather, blurredOriginal, width, height)
    // index 8：mask=100, feather=255 → alpha=100/255≈0.392；filled = [50,70,90]
    const o = 8 * 3
    expect(result[o]).toBe(80)
    expect(result[o + 1]).toBe(100)
    expect(result[o + 2]).toBe(120)
  })

  it('空遮罩时输出与原图逐字节一致', () => {
    const emptyMask = new Uint8Array(width * height)
    const fullFeather = new Uint8Array(width * height).fill(255)
    const result = compositeErase(original, model, emptyMask, fullFeather, blurredOriginal, width, height)
    expect(Buffer.from(result)).toEqual(Buffer.from(original))
  })

  it('全遮罩（无环带）时输出等于模型输出', () => {
    const fullMask = new Uint8Array(width * height).fill(255)
    const fullFeather = new Uint8Array(width * height).fill(255)
    const result = compositeErase(original, model, fullMask, fullFeather, blurredOriginal, width, height)
    expect(Buffer.from(result)).toEqual(Buffer.from(model))
  })

  it('颗粒：相同种子结果确定，不同种子结果不同', () => {
    const zeros = new Uint8Array(width * height * 3)
    const a = compositeErase(original, model, mask, feather, zeros, width, height, 42)
    const aAgain = compositeErase(original, model, mask, feather, zeros, width, height, 42)
    const b = compositeErase(original, model, mask, feather, zeros, width, height, 43)
    expect(Buffer.from(a)).toEqual(Buffer.from(aAgain))
    expect(Buffer.from(a)).not.toEqual(Buffer.from(b))
    // 遮罩外仍不受颗粒影响
    const o = 4 * 3
    expect(a[o]).toBe(100)
  })
})
