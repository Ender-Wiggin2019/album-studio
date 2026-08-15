import type {
  ContentPage,
  CoverPage,
  MaskId,
  PhotoSlot,
  TextStyle,
  ThemeId
} from '@album-studio/common'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  CropIcon,
  ImageOffIcon,
  PaletteIcon,
  RefreshCwIcon
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStudioStore } from '@/app/store'
import { ThemePreviewCard } from '@/features/projects/theme-preview-card'

function InspectorSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onCommit
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onCommit: (value: number) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  return (
    <Field>
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <span className="font-mono text-xs text-muted-foreground">
          {Math.round(draft * 100) / 100}
          {unit}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[draft]}
        onValueChange={(next) => setDraft(next[0])}
        onValueCommit={(next) => onCommit(next[0])}
      />
    </Field>
  )
}

function TextStyleControls({
  style,
  onChange
}: {
  style: TextStyle
  onChange: (patch: Partial<TextStyle>) => void
}): React.JSX.Element {
  return (
    <FieldSet>
      <FieldLegend>文字样式</FieldLegend>
      <FieldGroup>
        <Field>
          <FieldLabel>字体</FieldLabel>
          <Select
            value={style.fontFamily}
            onValueChange={(value) => onChange({ fontFamily: value as TextStyle['fontFamily'] })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="serif">宋体</SelectItem>
              <SelectItem value="sans">黑体</SelectItem>
              <SelectItem value="handwritten">手写体</SelectItem>
              <SelectItem value="mono">等宽体</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <InspectorSlider
          key={`font-size-${style.fontSize}`}
          label="字号"
          value={style.fontSize}
          min={8}
          max={48}
          unit=" px"
          onCommit={(fontSize) => onChange({ fontSize })}
        />
        <Field>
          <FieldLabel>字重</FieldLabel>
          <ToggleGroup
            type="single"
            value={style.weight}
            onValueChange={(weight) =>
              weight && onChange({ weight: weight as TextStyle['weight'] })
            }
            className="grid grid-cols-4"
          >
            <ToggleGroupItem value="400">常规</ToggleGroupItem>
            <ToggleGroupItem value="500">中等</ToggleGroupItem>
            <ToggleGroupItem value="600">半粗</ToggleGroupItem>
            <ToggleGroupItem value="700">粗体</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field>
          <FieldLabel>对齐</FieldLabel>
          <ToggleGroup
            type="single"
            value={style.align}
            onValueChange={(align) => align && onChange({ align: align as TextStyle['align'] })}
            className="grid grid-cols-3"
          >
            <ToggleGroupItem value="left">左对齐</ToggleGroupItem>
            <ToggleGroupItem value="center">居中</ToggleGroupItem>
            <ToggleGroupItem value="right">右对齐</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <InspectorSlider
          key={`line-height-${style.lineHeight}`}
          label="行距"
          value={style.lineHeight}
          min={1}
          max={2.5}
          step={0.1}
          unit="×"
          onCommit={(lineHeight) => onChange({ lineHeight })}
        />
        <Field>
          <FieldLabel htmlFor="text-color">文字颜色</FieldLabel>
          <Input
            id="text-color"
            type="color"
            value={style.color}
            onChange={(event) => onChange({ color: event.currentTarget.value })}
            className="h-10 p-1"
          />
        </Field>
      </FieldGroup>
    </FieldSet>
  )
}

function PhotoInspector({ pageId, slot }: { pageId: string; slot: PhotoSlot }): React.JSX.Element {
  const project = useStudioStore((state) => state.project)
  const projectPath = useStudioStore((state) => state.projectPath)
  const mutateProject = useStudioStore((state) => state.mutateProject)
  const updatePhoto = useStudioStore((state) => state.updatePhoto)
  const removeSlotPhoto = useStudioStore((state) => state.removeSlotPhoto)
  const movePhotoWithinPage = useStudioStore((state) => state.movePhotoWithinPage)
  const movePhotoToPage = useStudioStore((state) => state.movePhotoToPage)
  const setMode = useStudioStore((state) => state.setMode)
  const missingAssetIds = useStudioStore((state) => state.missingAssetIds)
  const markAssetAvailable = useStudioStore((state) => state.markAssetAvailable)
  const [relinking, setRelinking] = useState(false)
  const asset = project?.assets.find((candidate) => candidate.id === slot.assetId)
  const missing = asset ? missingAssetIds.includes(asset.id) : false
  const page = project?.pages.find((candidate) => candidate.id === pageId)
  const pageIndex = project?.pages.findIndex((candidate) => candidate.id === pageId) ?? -1
  const slotIndex =
    page?.kind === 'content' ? page.slots.findIndex((item) => item.id === slot.id) : -1
  const updateCaption = (recipe: (target: PhotoSlot) => void): void =>
    mutateProject((draft) => {
      const page = draft.pages.find((candidate) => candidate.id === pageId)
      if (page?.kind !== 'content') return
      const target = page.slots.find((candidate) => candidate.id === slot.id)
      if (target) recipe(target)
    })
  const relinkAsset = async (): Promise<void> => {
    if (!asset || !projectPath || relinking) return
    setRelinking(true)
    try {
      const restored = await window.albumStudio.assets.relink({ projectPath, assetId: asset.id })
      if (!restored) return
      mutateProject((draft) => {
        const index = draft.assets.findIndex((candidate) => candidate.id === restored.id)
        if (index >= 0) draft.assets[index] = restored
      })
      markAssetAvailable(asset.id)
      toast.success('照片已恢复。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法恢复照片')
    } finally {
      setRelinking(false)
    }
  }
  return (
    <FieldGroup>
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="truncate text-sm font-medium">{asset?.fileName ?? '空照片位'}</p>
        {asset ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {asset.width} × {asset.height}
          </p>
        ) : null}
      </div>
      {asset && !missing ? (
        <Button onClick={() => setMode('photo-edit')}>
          <CropIcon data-icon="inline-start" />
          裁剪与旋转
        </Button>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          <ImageOffIcon className="mx-auto mb-2 size-5" />
          {asset ? '项目中的原图文件已缺失' : '请从素材库重新添加照片'}
          {asset ? (
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void relinkAsset()}
              disabled={relinking}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {relinking ? '正在验证…' : '重新定位原图'}
            </Button>
          ) : null}
        </div>
      )}
      {asset && page?.kind === 'content' ? (
        <FieldSet>
          <FieldLegend>移动照片</FieldLegend>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => movePhotoWithinPage(pageId, slot.id, -1)}
              disabled={slotIndex <= 0}
            >
              <ArrowLeftIcon data-icon="inline-start" />
              照片前移
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => movePhotoWithinPage(pageId, slot.id, 1)}
              disabled={slotIndex < 0 || slotIndex >= page.slots.length - 1}
            >
              <ArrowRightIcon data-icon="inline-start" />
              照片后移
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => movePhotoToPage(pageId, slot.id, -1)}
              disabled={pageIndex <= 1}
            >
              <ChevronsLeftIcon data-icon="inline-start" />
              移到上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => movePhotoToPage(pageId, slot.id, 1)}
              disabled={pageIndex < 0 || pageIndex >= (project?.pages.length ?? 0) - 1}
            >
              <ChevronsRightIcon data-icon="inline-start" />
              移到下一页
            </Button>
          </div>
        </FieldSet>
      ) : null}
      <FieldSet>
        <FieldLegend>变换</FieldLegend>
        <FieldGroup>
          <InspectorSlider
            key={`${slot.id}-scale-${slot.media.scale}`}
            label="缩放"
            value={slot.media.scale}
            min={0.25}
            max={3}
            step={0.01}
            unit="×"
            onCommit={(value) => updatePhoto(pageId, slot.id, { media: { scale: value } })}
          />
          <InspectorSlider
            key={`${slot.id}-rotation-${slot.media.rotationDeg}`}
            label="旋转"
            value={slot.media.rotationDeg}
            min={-180}
            max={180}
            step={1}
            unit="°"
            onCommit={(value) => updatePhoto(pageId, slot.id, { media: { rotationDeg: value } })}
          />
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>画面</FieldLegend>
        <FieldGroup>
          <InspectorSlider
            key={`${slot.id}-brightness-${slot.filters.brightness}`}
            label="亮度"
            value={slot.filters.brightness}
            min={0.4}
            max={1.6}
            step={0.01}
            unit="×"
            onCommit={(value) => updatePhoto(pageId, slot.id, { filters: { brightness: value } })}
          />
          <InspectorSlider
            key={`${slot.id}-contrast-${slot.filters.contrast}`}
            label="对比度"
            value={slot.filters.contrast}
            min={0.4}
            max={1.6}
            step={0.01}
            unit="×"
            onCommit={(value) => updatePhoto(pageId, slot.id, { filters: { contrast: value } })}
          />
          <InspectorSlider
            key={`${slot.id}-saturation-${slot.filters.saturation}`}
            label="饱和度"
            value={slot.filters.saturation}
            min={0}
            max={2}
            step={0.01}
            unit="×"
            onCommit={(value) => updatePhoto(pageId, slot.id, { filters: { saturation: value } })}
          />
        </FieldGroup>
      </FieldSet>
      <Field>
        <FieldLabel>蒙版</FieldLabel>
        <Select
          value={slot.maskId}
          onValueChange={(value) => updatePhoto(pageId, slot.id, { maskId: value as MaskId })}
        >
          <SelectTrigger>
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
      <Field>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={slot.caption.enabled}
            onCheckedChange={(checked) =>
              updateCaption((target) => void (target.caption.enabled = checked === true))
            }
          />
          显示照片说明
        </label>
        {slot.caption.enabled ? (
          <Textarea
            key={`${slot.id}-${slot.caption.text}`}
            defaultValue={slot.caption.text}
            placeholder="写下地点、人物或当时的故事"
            onBlur={(event) => {
              const text = event.currentTarget.value
              if (text !== slot.caption.text)
                updateCaption((target) => void (target.caption.text = text))
            }}
          />
        ) : null}
      </Field>
      {slot.caption.enabled ? (
        <TextStyleControls
          style={slot.caption.style}
          onChange={(patch) =>
            updateCaption(
              (target) => void (target.caption.style = { ...target.caption.style, ...patch })
            )
          }
        />
      ) : null}
      {asset ? (
        <Button variant="outline" onClick={() => removeSlotPhoto(pageId, slot.id)}>
          从页面移除
        </Button>
      ) : null}
    </FieldGroup>
  )
}

export function ContextInspector({ embedded = false }: { embedded?: boolean }): React.JSX.Element {
  const project = useStudioStore((state) => state.project)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedSlotId = useStudioStore((state) => state.selectedSlotId)
  const mutateProject = useStudioStore((state) => state.mutateProject)
  const changePageLayout = useStudioStore((state) => state.changePageLayout)
  const setTheme = useStudioStore((state) => state.setTheme)
  const page = project?.pages.find((candidate) => candidate.id === selectedPageId)
  const slot =
    page?.kind === 'content'
      ? page.slots.find((candidate) => candidate.id === selectedSlotId)
      : null
  if (!project || !page)
    return <aside className={embedded ? 'inspector inspector-embedded' : 'inspector'} />
  const occupiedCount =
    page.kind === 'content' ? page.slots.filter((item) => item.assetId).length : 0
  const mutateCover = (recipe: (target: CoverPage) => void): void =>
    mutateProject((draft) => {
      const target = draft.pages.find((candidate) => candidate.id === page.id)
      if (target?.kind === 'cover') recipe(target)
    })
  const mutateContent = (recipe: (target: ContentPage) => void): void =>
    mutateProject((draft) => {
      const target = draft.pages.find((candidate) => candidate.id === page.id)
      if (target?.kind === 'content') recipe(target)
    })
  return (
    <aside
      className={
        embedded ? 'inspector inspector-embedded bg-background' : 'inspector border-l bg-background'
      }
      aria-label="属性"
    >
      <div className="inspector-heading">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            当前对象
          </p>
          <h2 className="mt-1 font-semibold">
            {slot ? '照片' : page.kind === 'cover' ? '封面' : '页面'}
          </h2>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="选择主题">
              <PaletteIcon />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>相册主题</SheetTitle>
              <SheetDescription>只改变相册页面和导出 PDF，不改变应用界面。</SheetDescription>
            </SheetHeader>
            <SheetBody>
              <div className="grid gap-3">
                {(['journal', 'postcard', 'film'] as const).map((theme) => (
                  <ThemePreviewCard
                    key={theme}
                    themeId={theme}
                    selected={project.themeId === theme}
                    onSelect={() => setTheme(theme as ThemeId)}
                  />
                ))}
              </div>
            </SheetBody>
          </SheetContent>
        </Sheet>
      </div>
      <div className="inspector-body">
        {slot && page.kind === 'content' ? (
          <PhotoInspector pageId={page.id} slot={slot} />
        ) : page.kind === 'cover' ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cover-title">封面标题</FieldLabel>
              <Input
                id="cover-title"
                key={`${page.id}-title-${page.title}`}
                defaultValue={page.title}
                maxLength={160}
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim()
                  if (value && value !== page.title)
                    mutateProject((draft) => {
                      draft.title = value
                      const cover = draft.pages.find((candidate) => candidate.id === page.id)
                      if (cover?.kind === 'cover') cover.title = value
                    })
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cover-subtitle">副标题</FieldLabel>
              <Textarea
                id="cover-subtitle"
                key={`${page.id}-subtitle-${page.subtitle}`}
                defaultValue={page.subtitle}
                onBlur={(event) => {
                  const value = event.currentTarget.value
                  if (value !== page.subtitle)
                    mutateCover((target) => void (target.subtitle = value))
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="cover-date-label">日期或地点</FieldLabel>
              <Input
                id="cover-date-label"
                key={`${page.id}-date-${page.dateLabel}`}
                defaultValue={page.dateLabel}
                placeholder="例如 2026 · 北海道"
                onBlur={(event) => {
                  const value = event.currentTarget.value
                  if (value !== page.dateLabel)
                    mutateCover((target) => void (target.dateLabel = value))
                }}
              />
            </Field>
            <Field>
              <FieldLabel>封面照片</FieldLabel>
              <Select
                value={page.heroAssetId ?? 'none'}
                onValueChange={(value) =>
                  mutateCover(
                    (target) => void (target.heroAssetId = value === 'none' ? null : value)
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择封面照片" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不使用照片</SelectItem>
                  {project.assets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.fileName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>封面会使用原图的中央区域。</FieldDescription>
            </Field>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>页面布局</FieldLabel>
              <ToggleGroup
                type="single"
                value={String(page.slots.length)}
                onValueChange={(value) => value && changePageLayout(page.id, Number(value))}
                className="grid grid-cols-6"
              >
                {[1, 2, 3, 4, 5, 6].map((count) => (
                  <ToggleGroupItem
                    key={count}
                    value={String(count)}
                    disabled={count < occupiedCount}
                  >
                    {count}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <FieldDescription>
                已使用 {occupiedCount} 个照片位；不能选择会移除页面照片的布局。
              </FieldDescription>
            </Field>
            <Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={page.note.enabled}
                  onCheckedChange={(checked) =>
                    mutateContent((target) => void (target.note.enabled = checked === true))
                  }
                />
                显示页下注释
              </label>
              {page.note.enabled ? (
                <>
                  <Textarea
                    key={`${page.id}-note-${page.note.text}`}
                    defaultValue={page.note.text}
                    placeholder="这一页的故事…"
                    onBlur={(event) => {
                      const value = event.currentTarget.value
                      if (value !== page.note.text)
                        mutateContent((target) => void (target.note.text = value))
                    }}
                  />
                  <TextStyleControls
                    style={page.note.style}
                    onChange={(patch) =>
                      mutateContent(
                        (target) => void (target.note.style = { ...target.note.style, ...patch })
                      )
                    }
                  />
                </>
              ) : null}
            </Field>
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              点击画布中的照片，可以编辑裁剪、滤镜、蒙版和说明。
            </div>
          </FieldGroup>
        )}
      </div>
    </aside>
  )
}
