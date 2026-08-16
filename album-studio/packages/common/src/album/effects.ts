import { z } from 'zod'
import { DEFAULT_IMAGE_EFFECTS } from './create'
import { ImageEffectsSchema, type ImageEffects } from './schema'

export const IMAGE_EFFECT_PRESET_IDS = [
  'original',
  'vivid',
  'warm-sun',
  'clear',
  'film',
  'monochrome',
  'soft',
  'high-contrast'
] as const
export const ImageEffectPresetIdSchema = z.enum(IMAGE_EFFECT_PRESET_IDS)
export type ImageEffectPresetId = z.infer<typeof ImageEffectPresetIdSchema>

export type ImageEffectPreset = Readonly<{
  id: ImageEffectPresetId
  name: string
  effects: Readonly<ImageEffects>
}>

function preset(
  id: ImageEffectPresetId,
  name: string,
  overrides: Partial<ImageEffects>
): ImageEffectPreset {
  return Object.freeze({
    id,
    name,
    effects: Object.freeze(ImageEffectsSchema.parse({ ...DEFAULT_IMAGE_EFFECTS, ...overrides }))
  })
}

export const IMAGE_EFFECT_PRESETS: readonly ImageEffectPreset[] = Object.freeze([
  preset('original', '原图', {}),
  preset('vivid', '鲜亮', {
    brightness: 1.05,
    contrast: 1.08,
    saturation: 1.2
  }),
  preset('warm-sun', '暖阳', {
    brightness: 1.06,
    contrast: 1.03,
    saturation: 1.08,
    hueDeg: -6,
    sepia: 0.14,
    vignette: 0.08
  }),
  preset('clear', '清透', {
    brightness: 1.08,
    contrast: 1.06,
    saturation: 0.96
  }),
  preset('film', '胶片', {
    brightness: 0.98,
    contrast: 1.12,
    saturation: 0.88,
    hueDeg: -4,
    sepia: 0.12,
    vignette: 0.22
  }),
  preset('monochrome', '黑白', {
    contrast: 1.1,
    saturation: 0,
    grayscale: 1,
    vignette: 0.12
  }),
  preset('soft', '柔和', {
    brightness: 1.06,
    contrast: 0.9,
    saturation: 0.92,
    blurPx: 0.35
  }),
  preset('high-contrast', '高对比', {
    contrast: 1.32,
    saturation: 1.08,
    vignette: 0.16
  })
])

const presetsById = new Map(
  IMAGE_EFFECT_PRESETS.map((effectPreset) => [effectPreset.id, effectPreset])
)

export function getImageEffectPreset(presetId: ImageEffectPresetId): ImageEffectPreset {
  const effectPreset = presetsById.get(presetId)
  if (!effectPreset) throw new Error(`未知图片预设：${presetId}`)
  return effectPreset
}

export function applyImageEffectPreset(presetId: ImageEffectPresetId): ImageEffects {
  return { ...getImageEffectPreset(presetId).effects }
}

export type ImageEffectStyle = Readonly<{
  filter: string
  vignetteBackground: string
}>

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000
}

export function computeImageEffectStyle(input: ImageEffects): ImageEffectStyle {
  const effects = ImageEffectsSchema.parse(input)
  const vignetteOpacity = rounded(effects.vignette * 0.75)
  const vignetteStart = rounded(72 - effects.vignette * 24)
  return {
    filter: [
      `brightness(${effects.brightness})`,
      `contrast(${effects.contrast})`,
      `saturate(${effects.saturation})`,
      `hue-rotate(${effects.hueDeg}deg)`,
      `sepia(${effects.sepia})`,
      `grayscale(${effects.grayscale})`,
      `blur(${effects.blurPx}px)`
    ].join(' '),
    vignetteBackground:
      effects.vignette === 0
        ? 'none'
        : `radial-gradient(circle at center, transparent ${vignetteStart}%, rgba(0, 0, 0, ${vignetteOpacity}) 100%)`
  }
}
