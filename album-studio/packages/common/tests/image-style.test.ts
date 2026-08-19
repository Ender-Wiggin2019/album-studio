import { describe, expect, it } from 'vitest'
import {
  IMAGE_EFFECT_PRESETS,
  applyImageEffectPreset,
  computeCropStyle,
  computeImageEffectStyle,
  fitBlockTransformToCrop
} from '../src'

describe('pure image rendering calculations', () => {
  it('turns a preset into an independent effect value', () => {
    const first = applyImageEffectPreset('warm-sun')
    const second = applyImageEffectPreset('warm-sun')

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(IMAGE_EFFECT_PRESETS.map((preset) => preset.name)).toEqual([
      '原图',
      '鲜亮',
      '暖阳',
      '清透',
      '胶片',
      '黑白',
      '柔和',
      '高对比'
    ])
  })

  it('computes one deterministic CSS filter and vignette', () => {
    const style = computeImageEffectStyle(applyImageEffectPreset('film'))

    expect(style.filter).toContain('contrast(1.12)')
    expect(style.filter).toContain('sepia(0.12)')
    expect(style.vignetteBackground).toContain('radial-gradient')
    expect(computeImageEffectStyle(applyImageEffectPreset('original')).vignetteBackground).toBe(
      'none'
    )
  })

  it('maps full-image crop percentages to the viewport without distortion', () => {
    const style = computeCropStyle(
      {
        area: { x: 0, y: 0, width: 100, height: 100 },
        rotationDeg: 0,
        flipX: false,
        flipY: false
      },
      { width: 400, height: 300 },
      { width: 800, height: 600 }
    )

    expect(style).toMatchObject({
      left: '0px',
      top: '0px',
      width: '800px',
      height: '600px',
      transform: 'rotate(0deg) scaleX(1) scaleY(1)'
    })
  })

  it('positions a percentage crop and preserves rotation/flip', () => {
    const style = computeCropStyle(
      {
        area: { x: 25, y: 0, width: 50, height: 100 },
        rotationDeg: 0,
        flipX: true,
        flipY: false
      },
      { width: 400, height: 300 },
      { width: 300, height: 450 }
    )

    expect(style).toMatchObject({
      left: '-150px',
      top: '0px',
      width: '600px',
      height: '450px',
      transform: 'rotate(0deg) scaleX(-1) scaleY(1)'
    })
  })

  it('keeps the block untouched for an unrotated full-image crop', () => {
    const transform = { x: 0.25, y: 0.36, width: 0.5, height: 0.28, rotationDeg: 0 }

    expect(
      fitBlockTransformToCrop({
        transform,
        pageWidthMm: 297,
        pageHeightMm: 210,
        assetWidth: 400,
        assetHeight: 300,
        rotationDeg: 0,
        area: { x: 0, y: 0, width: 100, height: 100 }
      })
    ).toEqual(transform)
  })

  it('reshapes the block to the crop ratio, keeping its center and area', () => {
    const result = fitBlockTransformToCrop({
      transform: { x: 0.2, y: 0.2, width: 0.5, height: 0.28, rotationDeg: 0 },
      pageWidthMm: 297,
      pageHeightMm: 210,
      assetWidth: 400,
      assetHeight: 300,
      rotationDeg: 0,
      // 4:3 原图上裁出 1:1 区域（宽 75% × 高 100% → 300px × 300px）
      area: { x: 0, y: 0, width: 75, height: 100 }
    })

    expect(result.x).toBeCloseTo(0.45 - result.width / 2, 10)
    expect(result.y).toBeCloseTo(0.34 - result.height / 2, 10)
    expect(result.rotationDeg).toBe(0)
    // 视觉宽高比（乘页面宽高比后）等于裁剪区域宽高比
    expect((result.width * 297) / (result.height * 210)).toBeCloseTo(1, 10)
    // 面积保持，且仍在页面内
    expect(result.width * result.height).toBeCloseTo(0.5 * 0.28, 10)
    expect(result.x + result.width).toBeLessThanOrEqual(1 + 1e-9)
    expect(result.y + result.height).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('follows the rotated bounding box ratio for a rotated full-image crop', () => {
    const result = fitBlockTransformToCrop({
      transform: { x: 0.2, y: 0.2, width: 0.5, height: 0.28, rotationDeg: 0 },
      pageWidthMm: 297,
      pageHeightMm: 210,
      assetWidth: 400,
      assetHeight: 300,
      rotationDeg: 90,
      area: { x: 0, y: 0, width: 100, height: 100 }
    })

    expect(result.x).toBeCloseTo(0.45 - result.width / 2, 10)
    expect(result.y).toBeCloseTo(0.34 - result.height / 2, 10)
    expect((result.width * 297) / (result.height * 210)).toBeCloseTo(3 / 4, 10)
    expect(result.width * result.height).toBeCloseTo(0.5 * 0.28, 10)
  })

  it('shrinks the block to stay inside the page for extreme crop ratios', () => {
    const result = fitBlockTransformToCrop({
      transform: { x: 0.25, y: 0.4, width: 0.5, height: 0.2, rotationDeg: 0 },
      pageWidthMm: 297,
      pageHeightMm: 210,
      assetWidth: 400,
      assetHeight: 300,
      rotationDeg: 0,
      // 极宽条带裁剪：视觉宽高比远大于当前 Block
      area: { x: 0, y: 0, width: 100, height: 1 }
    })

    expect(result.x + result.width).toBeLessThanOrEqual(1 + 1e-9)
    expect(result.y + result.height).toBeLessThanOrEqual(1 + 1e-9)
    expect(result.x).toBeGreaterThanOrEqual(-1e-9)
    expect(result.y).toBeGreaterThanOrEqual(-1e-9)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect((result.width * 297) / (result.height * 210)).toBeCloseTo(
      (400 * 1) / (300 * 0.01),
      6
    )
  })
})
