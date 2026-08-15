import type { MaskId, PhotoFilters, PhotoPresentation } from '@album-studio/common'
import { FlipHorizontal2Icon, FlipVertical2Icon, RotateCcwIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import Cropper, { type Point, type Size } from 'react-easy-crop'
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
import { useStudioStore } from '@/app/store'

export function PhotoEditWorkspace(): React.JSX.Element {
  const project = useStudioStore((state) => state.project)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedSlotId = useStudioStore((state) => state.selectedSlotId)
  const setMode = useStudioStore((state) => state.setMode)
  const updatePhoto = useStudioStore((state) => state.updatePhoto)
  const page = project?.pages.find((candidate) => candidate.id === selectedPageId)
  const slot =
    page?.kind === 'content'
      ? page.slots.find((candidate) => candidate.id === selectedSlotId)
      : null
  const asset = project?.assets.find((candidate) => candidate.id === slot?.assetId)
  const [media, setMedia] = useState<PhotoPresentation>(() =>
    structuredClone(
      slot?.media ?? {
        fit: 'cover',
        crop: { x: 0, y: 0 },
        scale: 1,
        rotationDeg: 0,
        flipX: false,
        flipY: false
      }
    )
  )
  const [filters, setFilters] = useState<PhotoFilters>(() =>
    structuredClone(slot?.filters ?? { brightness: 1, contrast: 1, saturation: 1 })
  )
  const [maskId, setMaskId] = useState<MaskId>(slot?.maskId ?? 'rectangle')
  const [cropPixels, setCropPixels] = useState<Point>({ x: 0, y: 0 })
  const cropSize = useRef<Size | null>(null)
  const cropInitialized = useRef(false)

  if (!project || page?.kind !== 'content' || !slot || !asset) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="text-center">
          <p className="font-medium">这张照片暂时无法编辑</p>
          <Button className="mt-4" variant="outline" onClick={() => setMode('layout')}>
            返回排版
          </Button>
        </div>
      </div>
    )
  }

  const reset = (): void => {
    setMedia({
      fit: 'cover',
      crop: { x: 0, y: 0 },
      scale: 1,
      rotationDeg: 0,
      flipX: false,
      flipY: false
    })
    setFilters({ brightness: 1, contrast: 1, saturation: 1 })
    setMaskId('rectangle')
    setCropPixels({ x: 0, y: 0 })
  }
  const apply = (): void => {
    updatePhoto(page.id, slot.id, { media, filters, maskId })
    setMode('layout')
  }
  const imageUrl = window.albumStudio.assets.url(project.id, asset.id, 'original')
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#171a1f] text-white" aria-label="照片编辑">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5">
        <div>
          <p className="text-sm font-semibold">{asset.fileName}</p>
          <p className="text-xs text-white/55">裁剪与旋转</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setMode('layout')}
          >
            取消
          </Button>
          <Button onClick={apply}>应用到照片</Button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative min-h-[320px] overflow-hidden bg-[#0f1114]">
          <div
            className={`absolute inset-[7%] overflow-hidden shadow-2xl mask-${maskId}`}
            style={{
              filter: `brightness(${filters.brightness}) contrast(${filters.contrast}) saturate(${filters.saturation})`
            }}
          >
            <Cropper
              image={imageUrl}
              crop={cropPixels}
              zoom={media.scale}
              rotation={media.rotationDeg}
              aspect={slot.frame.width / slot.frame.height}
              objectFit={media.fit}
              minZoom={0.25}
              maxZoom={3}
              transform={`translate(${cropPixels.x}px, ${cropPixels.y}px) rotate(${media.rotationDeg}deg) scale(${media.scale}) scaleX(${media.flipX ? -1 : 1}) scaleY(${media.flipY ? -1 : 1})`}
              onCropSizeChange={(size) => {
                const previous = cropSize.current
                cropSize.current = size
                if (!cropInitialized.current) {
                  cropInitialized.current = true
                  setCropPixels({
                    x: (media.crop.x / 100) * size.width,
                    y: (media.crop.y / 100) * size.height
                  })
                } else if (previous) {
                  setCropPixels((current) => ({
                    x: (current.x / previous.width) * size.width,
                    y: (current.y / previous.height) * size.height
                  }))
                }
              }}
              onCropChange={(crop) => {
                setCropPixels(crop)
                const size = cropSize.current
                if (!size) return
                setMedia((current) => ({
                  ...current,
                  crop: {
                    x: Math.max(-100, Math.min(100, (crop.x / size.width) * 100)),
                    y: Math.max(-100, Math.min(100, (crop.y / size.height) * 100))
                  }
                }))
              }}
              onZoomChange={(scale) => setMedia((current) => ({ ...current, scale }))}
              onRotationChange={(rotationDeg) =>
                setMedia((current) => ({ ...current, rotationDeg }))
              }
              showGrid
              style={{
                containerStyle: { background: '#0f1114' },
                cropAreaStyle: {
                  border: '1px solid rgba(255,255,255,.9)',
                  boxShadow: '0 0 0 9999em rgba(0,0,0,.45)'
                }
              }}
            />
          </div>
        </div>
        <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-[#1d2025] p-5">
          <FieldGroup>
            <FieldSet>
              <FieldLegend className="text-white">变换</FieldLegend>
              <FieldGroup>
                <Field>
                  <div className="flex justify-between">
                    <FieldLabel>缩放</FieldLabel>
                    <span className="font-mono text-xs text-white/55">
                      {media.scale.toFixed(2)}×
                    </span>
                  </div>
                  <Slider
                    min={0.25}
                    max={3}
                    step={0.01}
                    value={[media.scale]}
                    onValueChange={(value) =>
                      setMedia((current) => ({ ...current, scale: value[0] }))
                    }
                  />
                </Field>
                <Field>
                  <div className="flex justify-between">
                    <FieldLabel>旋转</FieldLabel>
                    <span className="font-mono text-xs text-white/55">
                      {Math.round(media.rotationDeg)}°
                    </span>
                  </div>
                  <Slider
                    min={-180}
                    max={180}
                    step={1}
                    value={[media.rotationDeg]}
                    onValueChange={(value) =>
                      setMedia((current) => ({ ...current, rotationDeg: value[0] }))
                    }
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={media.flipX ? 'default' : 'outline'}
                    onClick={() => setMedia((current) => ({ ...current, flipX: !current.flipX }))}
                  >
                    <FlipHorizontal2Icon data-icon="inline-start" />
                    水平翻转
                  </Button>
                  <Button
                    variant={media.flipY ? 'default' : 'outline'}
                    onClick={() => setMedia((current) => ({ ...current, flipY: !current.flipY }))}
                  >
                    <FlipVertical2Icon data-icon="inline-start" />
                    垂直翻转
                  </Button>
                </div>
              </FieldGroup>
            </FieldSet>
            <Field>
              <FieldLabel>蒙版</FieldLabel>
              <Select value={maskId} onValueChange={(value) => setMaskId(value as MaskId)}>
                <SelectTrigger className="border-white/20 bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rectangle">直角矩形</SelectItem>
                  <SelectItem value="rounded">圆角矩形</SelectItem>
                  <SelectItem value="circle">圆形</SelectItem>
                  <SelectItem value="arch">拱门</SelectItem>
                  <SelectItem value="paper-edge">纸边</SelectItem>
                  <SelectItem value="postage">邮票边</SelectItem>
                  <SelectItem value="film-frame">胶片框</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <FieldSet>
              <FieldLegend className="text-white">画面</FieldLegend>
              <FieldGroup>
                {(
                  [
                    ['亮度', 'brightness'],
                    ['对比度', 'contrast'],
                    ['饱和度', 'saturation']
                  ] as const
                ).map(([label, key]) => (
                  <Field key={key}>
                    <div className="flex justify-between">
                      <FieldLabel>{label}</FieldLabel>
                      <span className="font-mono text-xs text-white/55">
                        {filters[key].toFixed(2)}×
                      </span>
                    </div>
                    <Slider
                      min={key === 'saturation' ? 0 : 0.4}
                      max={key === 'saturation' ? 2 : 1.6}
                      step={0.01}
                      value={[filters[key]]}
                      onValueChange={(value) =>
                        setFilters((current) => ({ ...current, [key]: value[0] }))
                      }
                    />
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
            <Button variant="outline" onClick={reset}>
              <RotateCcwIcon data-icon="inline-start" />
              重置当前照片
            </Button>
          </FieldGroup>
        </aside>
      </div>
    </section>
  )
}
