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
import {
  AlertCircleIcon,
  FlipHorizontal2Icon,
  FlipVertical2Icon,
  RotateCcwIcon,
  Wand2Icon
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ReactCrop, { type Crop, type PercentCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useStudioStore } from '@/app/store'
import { useAssetSource } from '@/shared/assets/use-asset-source'
import { useEditSource } from '@/shared/crop/use-edit-source'
import { useElementSize } from '@/shared/dom/use-element-size'
import { autoEnhanceImageSource } from './auto-enhance-image-source'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  MediaWorkspace,
  MediaWorkspaceActions,
  MediaWorkspaceBody,
  MediaWorkspaceDescription,
  MediaWorkspaceHeader,
  MediaWorkspaceIdentity,
  MediaWorkspacePanel,
  MediaWorkspaceStage,
  MediaWorkspaceTitle
} from '@/components/studio/media-workspace'

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
  { key: 'vignette', label: '暗角', min: 0, max: 1, step: 0.01, suffix: '' },
  { key: 'beautySmooth', label: '磨皮', min: 0, max: 1, step: 0.01, suffix: '' },
  { key: 'beautyWhiten', label: '美白', min: 0, max: 1, step: 0.01, suffix: '' },
  { key: 'clarity', label: '清晰度', min: 0, max: 1, step: 0.01, suffix: '' }
]
const BEAUTY_MAX_EDGE = 2048
const CROP_ARIA_LABELS = {
  cropArea: '裁剪区域',
  nwDragHandle: '左上裁剪手柄',
  nDragHandle: '上方裁剪手柄',
  neDragHandle: '右上裁剪手柄',
  eDragHandle: '右侧裁剪手柄',
  seDragHandle: '右下裁剪手柄',
  sDragHandle: '下方裁剪手柄',
  swDragHandle: '左下裁剪手柄',
  wDragHandle: '左侧裁剪手柄'
} as const

function sameArea(left: ImageCrop['area'], right: PercentCrop): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function hasPresetEffects(current: ImageEffects, preset: ImageEffects): boolean {
  return (Object.keys(current) as Array<keyof ImageEffects>).every(
    (key) => current[key] === preset[key]
  )
}

function fullImageCrop(): Crop {
  return { unit: '%', x: 0, y: 0, width: 100, height: 100 }
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
  const [crop, setCrop] = useState<ImageCrop>(() =>
    structuredClone(imageBlock?.crop ?? DEFAULT_IMAGE_CROP)
  )
  const [selection, setSelection] = useState<Crop>(() => ({
    unit: '%',
    ...(imageBlock?.crop.area ?? DEFAULT_IMAGE_CROP.area)
  }))
  const [effects, setEffects] = useState<ImageEffects>(() =>
    structuredClone(imageBlock?.effects ?? DEFAULT_IMAGE_EFFECTS)
  )
  const [mask, setMask] = useState<ImageMask>(() =>
    structuredClone(imageBlock?.mask ?? DEFAULT_IMAGE_MASK)
  )
  const source = useAssetSource(document?.id ?? '', asset?.id ?? null, { quality: 'original' })
  const editState = useEditSource(
    source.source,
    {
      beautySmooth: effects.beautySmooth,
      beautyWhiten: effects.beautyWhiten,
      clarity: effects.clarity,
      rotationDeg: crop.rotationDeg,
      flipX: crop.flipX,
      flipY: crop.flipY
    },
    BEAUTY_MAX_EDGE
  )
  const editSource = editState.source
  const effectStyle = computeImageEffectStyle(effects)
  const [autoAnalysis, setAutoAnalysis] = useState<{
    requestId: number
    inputKey: string
  } | null>(null)
  const autoRequestRef = useRef(0)
  const autoInputKey = JSON.stringify([source.source, crop])
  const autoInputKeyRef = useRef(autoInputKey)
  const autoAnalyzing = autoAnalysis?.inputKey === autoInputKey
  const viewportRef = useRef<HTMLDivElement>(null)
  const viewportSize = useElementSize(viewportRef)
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null)
  // 预览图按原比例 contain 放入视口且不放大原图：整张照片（含底部）始终可见、
  // 四周留出空间方便拖拽裁剪框，小图也不会被放大到占满整个预览区
  const displaySize =
    viewportSize && naturalSize
      ? (() => {
          const scale = Math.min(
            1,
            viewportSize.width / naturalSize.width,
            viewportSize.height / naturalSize.height
          )
          return {
            width: Math.max(1, Math.floor(naturalSize.width * scale)),
            height: Math.max(1, Math.floor(naturalSize.height * scale))
          }
        })()
      : undefined

  useEffect(() => {
    autoInputKeyRef.current = autoInputKey
    autoRequestRef.current += 1
  }, [autoInputKey])

  useEffect(
    () => () => {
      autoRequestRef.current += 1
    },
    []
  )

  const handleAutoEnhance = async (): Promise<void> => {
    if (!source.source || autoAnalyzing) return
    const requestId = ++autoRequestRef.current
    const inputKey = autoInputKey
    setAutoAnalysis({ requestId, inputKey })
    try {
      const auto = await autoEnhanceImageSource(source.source, crop)
      if (auto && requestId === autoRequestRef.current && inputKey === autoInputKeyRef.current) {
        setEffects((current) => ({
          ...current,
          brightness: auto.brightness,
          contrast: auto.contrast,
          saturation: auto.saturation
        }))
      }
    } finally {
      if (requestId === autoRequestRef.current) {
        setAutoAnalysis((current) => (current?.requestId === requestId ? null : current))
      }
    }
  }

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
    setCrop(structuredClone(DEFAULT_IMAGE_CROP))
    setSelection(fullImageCrop())
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
    <MediaWorkspace aria-label="照片编辑">
      <MediaWorkspaceHeader>
        <MediaWorkspaceIdentity>
          <MediaWorkspaceTitle>{asset.fileName}</MediaWorkspaceTitle>
          <MediaWorkspaceDescription>
            自由裁剪、框内旋转、滤镜、美颜与蒙版
          </MediaWorkspaceDescription>
        </MediaWorkspaceIdentity>
        <MediaWorkspaceActions>
          <Button variant="ghost" onClick={() => setExclusiveWorkspace(null)}>
            取消
          </Button>
          <Button disabled={autoAnalyzing || editState.pending || !source.source} onClick={apply}>
            应用到照片
          </Button>
        </MediaWorkspaceActions>
      </MediaWorkspaceHeader>

      <MediaWorkspaceBody className="grid-rows-[minmax(280px,1.15fr)_minmax(180px,0.85fr)] lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)]">
        <MediaWorkspaceStage>
          <div className="absolute inset-[9%] shadow-lg ring-1 ring-white/10">
            <div ref={viewportRef} className="album-image-viewport" data-mask={mask.kind}>
              {source.source ? (
                <div className="grid size-full place-items-center">
                  <ReactCrop
                    ariaLabels={CROP_ARIA_LABELS}
                    crop={selection}
                    disabled={editState.pending || autoAnalyzing}
                    onChange={(_, percentageCrop) => setSelection(percentageCrop)}
                    onComplete={(_, percentageCrop) =>
                      setCrop((current) =>
                        sameArea(current.area, percentageCrop)
                          ? current
                          : {
                              ...current,
                              area: {
                                x: percentageCrop.x,
                                y: percentageCrop.y,
                                width: percentageCrop.width,
                                height: percentageCrop.height
                              }
                            }
                      )
                    }
                    keepSelection
                    minWidth={64}
                    minHeight={64}
                    ruleOfThirds
                  >
                    <img
                      className="album-edit-source-image"
                      src={editSource ?? source.source}
                      alt={asset.fileName}
                      draggable={false}
                      style={{
                        width: displaySize?.width,
                        height: displaySize?.height,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        filter: effectStyle.filter
                      }}
                      onLoad={(event) => {
                        const image = event.currentTarget
                        setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight })
                      }}
                    />
                  </ReactCrop>
                </div>
              ) : (
                <div className="grid size-full place-items-center text-sm text-media-stage-muted">
                  {source.failed ? (
                    '无法读取原图'
                  ) : (
                    <span className="flex items-center gap-2">
                      <Spinner />
                      正在读取原图…
                    </span>
                  )}
                </div>
              )}
              {effects.vignette > 0 ? (
                <span
                  className="album-image-vignette z-10"
                  style={{ background: effectStyle.vignetteBackground }}
                />
              ) : null}
              {editState.pending ? (
                <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-media-stage/45 text-xs text-media-stage-foreground">
                  <span className="flex items-center gap-2 rounded-md bg-media-stage-surface/95 px-3 py-2">
                    <Spinner />
                    正在更新预览
                  </span>
                </div>
              ) : null}
              {editState.failed ? (
                <Alert className="absolute inset-x-3 bottom-3 z-20 bg-background/95 text-foreground">
                  <AlertCircleIcon />
                  <AlertDescription>预览处理失败，当前显示原图。</AlertDescription>
                </Alert>
              ) : null}
            </div>
          </div>
        </MediaWorkspaceStage>

        <MediaWorkspacePanel>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>裁剪与框内变换</FieldLegend>
              <FieldGroup>
                <Field>
                  <div className="flex justify-between">
                    <FieldLabel>框内旋转</FieldLabel>
                    <span className="font-mono text-xs text-muted-foreground">
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
                <ToggleGroup
                  type="multiple"
                  value={[
                    ...(crop.flipX ? ['horizontal'] : []),
                    ...(crop.flipY ? ['vertical'] : [])
                  ]}
                  onValueChange={(values) =>
                    setCrop((current) => ({
                      ...current,
                      flipX: values.includes('horizontal'),
                      flipY: values.includes('vertical')
                    }))
                  }
                  className="grid w-full grid-cols-2"
                >
                  <ToggleGroupItem value="horizontal" aria-label="水平翻转">
                    <FlipHorizontal2Icon data-icon="inline-start" />
                    水平翻转
                  </ToggleGroupItem>
                  <ToggleGroupItem value="vertical" aria-label="垂直翻转">
                    <FlipVertical2Icon data-icon="inline-start" />
                    垂直翻转
                  </ToggleGroupItem>
                </ToggleGroup>
              </FieldGroup>
            </FieldSet>

            <Field>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel>滤镜预设</FieldLabel>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={autoAnalyzing || !source.source}
                  onClick={() => void handleAutoEnhance()}
                >
                  <Wand2Icon data-icon="inline-start" />
                  {autoAnalyzing ? '正在分析…' : '自动美化'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {IMAGE_EFFECT_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={hasPresetEffects(effects, preset.effects) ? 'default' : 'outline'}
                    size="sm"
                    className="justify-start"
                    onClick={() => setEffects({ ...preset.effects })}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>
            </Field>

            <FieldSet>
              <FieldLegend>精细美化</FieldLegend>
              <FieldGroup>
                {EFFECT_CONTROLS.map(({ key, label, min, max, step, suffix }) => (
                  <Field key={key}>
                    <div className="flex justify-between">
                      <FieldLabel>{label}</FieldLabel>
                      <span className="font-mono text-xs text-muted-foreground">
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
                <SelectTrigger aria-label="蒙版">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {MASK_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {MASK_NAMES[kind]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button variant="outline" onClick={reset}>
              <RotateCcwIcon data-icon="inline-start" />
              重置当前照片
            </Button>
          </FieldGroup>
        </MediaWorkspacePanel>
      </MediaWorkspaceBody>
    </MediaWorkspace>
  )
}
