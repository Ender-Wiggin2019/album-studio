import {
  DEFAULT_IMAGE_CROP,
  DEFAULT_IMAGE_EFFECTS,
  DEFAULT_IMAGE_MASK,
  IMAGE_EFFECT_PRESETS,
  MASK_KINDS,
  computeImageEffectStyle,
  type ImageCrop,
  type ImageEffects,
  type ImageMask
} from '@album-studio/common'
import { FlipHorizontal2Icon, FlipVertical2Icon, RotateCcwIcon } from 'lucide-react'
import { useState } from 'react'
import Cropper, { type Area, type Point } from 'react-easy-crop'
import { useStudioStore } from '@/app/store'
import { useAssetSource } from '@/shared/assets/use-asset-source'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'

const MASK_NAMES: Record<(typeof MASK_KINDS)[number], string> = {
  rectangle: '直角矩形',
  rounded: '圆角矩形',
  circle: '圆形',
  arch: '拱门',
  'paper-edge': '撕纸边',
  postage: '邮票边',
  'film-frame': '胶片框'
}

const EFFECT_CONTROLS: ReadonlyArray<{
  key: keyof ImageEffects
  label: string
  min: number
  max: number
  step: number
  suffix: string
}> = [
  { key: 'brightness', label: '亮度', min: 0, max: 2, step: 0.01, suffix: '×' },
  { key: 'contrast', label: '对比度', min: 0, max: 2, step: 0.01, suffix: '×' },
  { key: 'saturation', label: '饱和度', min: 0, max: 2, step: 0.01, suffix: '×' },
  { key: 'hueDeg', label: '色相', min: -180, max: 180, step: 1, suffix: '°' },
  { key: 'sepia', label: '复古', min: 0, max: 1, step: 0.01, suffix: '' },
  { key: 'grayscale', label: '黑白', min: 0, max: 1, step: 0.01, suffix: '' },
  { key: 'blurPx', label: '柔焦', min: 0, max: 20, step: 0.1, suffix: 'px' },
  { key: 'vignette', label: '暗角', min: 0, max: 1, step: 0.01, suffix: '' }
]
const DARK_OUTLINE_BUTTON =
  'border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white'

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y
}

function sameArea(left: Area, right: Area): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function isValidArea(area: Area): boolean {
  return (
    Number.isFinite(area.x) &&
    Number.isFinite(area.y) &&
    Number.isFinite(area.width) &&
    Number.isFinite(area.height) &&
    area.width > 0 &&
    area.height > 0
  )
}

function isFullImageArea(area: Area): boolean {
  return area.x === 0 && area.y === 0 && area.width === 100 && area.height === 100
}

function hasPresetEffects(current: ImageEffects, preset: ImageEffects): boolean {
  return (Object.keys(current) as Array<keyof ImageEffects>).every(
    (key) => current[key] === preset[key]
  )
}

export function PhotoEditWorkspace(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedBlockId = useStudioStore((state) => state.selectedBlockId)
  const setExclusiveWorkspace = useStudioStore((state) => state.setExclusiveWorkspace)
  const dispatch = useStudioStore((state) => state.dispatch)
  const page = document?.pages.find((candidate) => candidate.id === selectedPageId)
  const selectedBlock = selectedBlockId
    ? page?.blocks.find((candidate) => candidate.id === selectedBlockId)
    : undefined
  const imageBlock = selectedBlock?.type === 'image' ? selectedBlock : undefined
  const asset = document?.assets.find((candidate) => candidate.id === imageBlock?.assetId)
  const [cropPoint, setCropPoint] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [crop, setCrop] = useState<ImageCrop>(() =>
    structuredClone(imageBlock?.crop ?? DEFAULT_IMAGE_CROP)
  )
  const [effects, setEffects] = useState<ImageEffects>(() =>
    structuredClone(imageBlock?.effects ?? DEFAULT_IMAGE_EFFECTS)
  )
  const [mask, setMask] = useState<ImageMask>(() =>
    structuredClone(imageBlock?.mask ?? DEFAULT_IMAGE_MASK)
  )
  const [initialCropArea] = useState<Area>(() => ({
    ...(imageBlock?.crop.area ?? DEFAULT_IMAGE_CROP.area)
  }))
  const restoredCropArea = isFullImageArea(initialCropArea) ? undefined : initialCropArea
  const source = useAssetSource(document?.id ?? '', asset?.id ?? null, { quality: 'original' })
  const effectStyle = computeImageEffectStyle(effects)

  if (!document || !page || !imageBlock || !asset) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="text-center">
          <p className="font-medium">这张照片暂时无法编辑</p>
          <Button className="mt-4" variant="outline" onClick={() => setExclusiveWorkspace(null)}>
            返回排版
          </Button>
        </div>
      </div>
    )
  }

  const reset = (): void => {
    setCropPoint({ x: 0, y: 0 })
    setZoom(1)
    setCrop(structuredClone(DEFAULT_IMAGE_CROP))
    setEffects(structuredClone(DEFAULT_IMAGE_EFFECTS))
    setMask(structuredClone(DEFAULT_IMAGE_MASK))
  }
  const apply = (): void => {
    dispatch({
      type: 'update-image-edit',
      pageId: page.id,
      blockId: imageBlock.id,
      crop,
      effects,
      mask
    })
    setExclusiveWorkspace(null)
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#171a1f] text-white" aria-label="照片编辑">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5">
        <div>
          <p className="text-sm font-semibold">{asset.fileName}</p>
          <p className="text-xs text-white/55">裁剪、框内旋转、滤镜与蒙版</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setExclusiveWorkspace(null)}
          >
            取消
          </Button>
          <Button onClick={apply}>应用到照片</Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[320px] overflow-hidden bg-[#0f1114]">
          <div
            className="absolute inset-[7%] overflow-hidden shadow-2xl album-image-viewport"
            data-mask={mask.kind}
          >
            {source.source ? (
              <Cropper
                image={source.source}
                crop={cropPoint}
                zoom={zoom}
                rotation={crop.rotationDeg}
                aspect={imageBlock.transform.width / imageBlock.transform.height}
                minZoom={1}
                maxZoom={4}
                initialCroppedAreaPercentages={restoredCropArea}
                transform={`translate(${cropPoint.x}px, ${cropPoint.y}px) rotate(${crop.rotationDeg}deg) scale(${zoom}) scaleX(${crop.flipX ? -1 : 1}) scaleY(${crop.flipY ? -1 : 1})`}
                onCropChange={(nextPoint) =>
                  setCropPoint((current) => (samePoint(current, nextPoint) ? current : nextPoint))
                }
                onZoomChange={(nextZoom) =>
                  setZoom((current) => (current === nextZoom ? current : nextZoom))
                }
                onRotationChange={(rotationDeg) =>
                  setCrop((current) =>
                    current.rotationDeg === rotationDeg ? current : { ...current, rotationDeg }
                  )
                }
                onCropComplete={(croppedAreaPercentages) =>
                  setCrop((current) =>
                    !isValidArea(croppedAreaPercentages) ||
                    sameArea(current.area, croppedAreaPercentages)
                      ? current
                      : { ...current, area: croppedAreaPercentages }
                  )
                }
                showGrid
                style={{
                  containerStyle: { background: '#0f1114' },
                  mediaStyle: { filter: effectStyle.filter },
                  cropAreaStyle: {
                    border: '1px solid rgba(255,255,255,.92)',
                    boxShadow: '0 0 0 9999em rgba(0,0,0,.45)'
                  }
                }}
              />
            ) : (
              <div className="grid size-full place-items-center text-sm text-white/60">
                {source.failed ? '无法读取原图' : '正在读取原图…'}
              </div>
            )}
            {effects.vignette > 0 ? (
              <span
                className="album-image-vignette z-10"
                style={{ background: effectStyle.vignetteBackground }}
              />
            ) : null}
          </div>
        </div>
        <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-[#1d2025] p-5">
          <FieldGroup>
            <FieldSet>
              <FieldLegend className="text-white">裁剪与框内变换</FieldLegend>
              <FieldGroup>
                <Field>
                  <div className="flex justify-between">
                    <FieldLabel>缩放</FieldLabel>
                    <span className="font-mono text-xs text-white/55">{zoom.toFixed(2)}×</span>
                  </div>
                  <Slider
                    aria-label="缩放"
                    min={1}
                    max={4}
                    step={0.01}
                    value={[zoom]}
                    onValueChange={(value) => setZoom(value[0])}
                  />
                </Field>
                <Field>
                  <div className="flex justify-between">
                    <FieldLabel>框内旋转</FieldLabel>
                    <span className="font-mono text-xs text-white/55">
                      {Math.round(crop.rotationDeg)}°
                    </span>
                  </div>
                  <Slider
                    aria-label="框内旋转"
                    min={-180}
                    max={180}
                    step={1}
                    value={[crop.rotationDeg]}
                    onValueChange={(value) =>
                      setCrop((current) => ({ ...current, rotationDeg: value[0] }))
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={crop.flipX ? 'default' : 'outline'}
                    className={crop.flipX ? undefined : DARK_OUTLINE_BUTTON}
                    onClick={() => setCrop((current) => ({ ...current, flipX: !current.flipX }))}
                  >
                    <FlipHorizontal2Icon data-icon="inline-start" />
                    水平翻转
                  </Button>
                  <Button
                    variant={crop.flipY ? 'default' : 'outline'}
                    className={crop.flipY ? undefined : DARK_OUTLINE_BUTTON}
                    onClick={() => setCrop((current) => ({ ...current, flipY: !current.flipY }))}
                  >
                    <FlipVertical2Icon data-icon="inline-start" />
                    垂直翻转
                  </Button>
                </div>
              </FieldGroup>
            </FieldSet>

            <Field>
              <FieldLabel>滤镜预设</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {IMAGE_EFFECT_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={hasPresetEffects(effects, preset.effects) ? 'default' : 'outline'}
                    size="sm"
                    className={
                      hasPresetEffects(effects, preset.effects)
                        ? 'justify-start'
                        : `justify-start ${DARK_OUTLINE_BUTTON}`
                    }
                    onClick={() => setEffects({ ...preset.effects })}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>
            </Field>

            <FieldSet>
              <FieldLegend className="text-white">精细美化</FieldLegend>
              <FieldGroup>
                {EFFECT_CONTROLS.map(({ key, label, min, max, step, suffix }) => (
                  <Field key={key}>
                    <div className="flex justify-between">
                      <FieldLabel>{label}</FieldLabel>
                      <span className="font-mono text-xs text-white/55">
                        {effects[key].toFixed(key === 'hueDeg' ? 0 : 2)}
                        {suffix}
                      </span>
                    </div>
                    <Slider
                      aria-label={label}
                      min={min}
                      max={max}
                      step={step}
                      value={[effects[key]]}
                      onValueChange={(value) =>
                        setEffects((current) => ({ ...current, [key]: value[0] }))
                      }
                    />
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <Field>
              <FieldLabel>蒙版</FieldLabel>
              <Select
                value={mask.kind}
                onValueChange={(kind) => setMask({ kind: kind as ImageMask['kind'] })}
              >
                <SelectTrigger aria-label="蒙版" className="border-white/20 bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MASK_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {MASK_NAMES[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button variant="outline" className={DARK_OUTLINE_BUTTON} onClick={reset}>
              <RotateCcwIcon data-icon="inline-start" />
              重置当前照片
            </Button>
          </FieldGroup>
        </aside>
      </div>
    </section>
  )
}
