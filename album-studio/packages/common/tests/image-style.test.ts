import { describe, expect, it } from 'vitest'
import {
  IMAGE_EFFECT_PRESETS,
  applyImageEffectPreset,
  computeCropStyle,
  computeImageEffectStyle
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
})
