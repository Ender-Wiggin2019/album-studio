import {
  IMAGE_EFFECT_PRESETS,
  MASK_KINDS,
  type Block,
  type ImageBlock,
  type ImageCaption
} from '@album-studio/common'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  CropIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  PaletteIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ShapesIcon,
  Trash2Icon,
  Wand2Icon
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useStudioPlatform } from '@/app/platform/use-studio-platform'
import { useStudioStore } from '@/app/store'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/shared/lib/cn'

const RichTextEditor = lazy(async () => ({
  default: (await import('@/features/text-edit/rich-text-editor')).RichTextEditor
}))

const EMPTY_RECENT_COLORS: readonly string[] = []

const MASK_NAMES: Record<(typeof MASK_KINDS)[number], string> = {
  rectangle: '直角',
  rounded: '圆角',
  circle: '圆形',
  arch: '拱门',
  'paper-edge': '撕纸',
  postage: '邮票',
  'film-frame': '胶片'
}

const BLOCK_TYPE_NAMES: Record<Block['type'], string> = {
  image: '图片 Block',
  'rich-text': '文字 Block',
  decoration: '装饰 Block'
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="inspector-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function DraftInput({
  value,
  label,
  multiline = false,
  onCommit
}: {
  value: string
  label: string
  multiline?: boolean
  onCommit(value: string): void
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  const committedValueRef = useRef(value)
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  const commit = useCallback((): void => {
    const nextValue = draftRef.current
    if (nextValue === committedValueRef.current) return
    committedValueRef.current = nextValue
    onCommitRef.current(nextValue)
  }, [])

  useEffect(() => () => commit(), [commit])

  const updateDraft = (nextValue: string): void => {
    draftRef.current = nextValue
    setDraft(nextValue)
  }

  return multiline ? (
    <Textarea
      aria-label={label}
      value={draft}
      onChange={(event) => updateDraft(event.target.value)}
      onBlur={commit}
      rows={3}
    />
  ) : (
    <Input
      aria-label={label}
      value={draft}
      onChange={(event) => updateDraft(event.target.value)}
      onBlur={commit}
    />
  )
}

function normalizeRotation(rotationDeg: number): number {
  return ((((rotationDeg + 180) % 360) + 360) % 360) - 180
}

function BlockActions({ pageId, block }: { pageId: string; block: Block }): React.JSX.Element {
  const dispatch = useStudioStore((state) => state.dispatch)
  return (
    <Section title="图层与操作">
      <div className="grid grid-cols-4 gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="下移一层"
          onClick={() =>
            dispatch({
              type: 'move-block-layer',
              pageId,
              blockId: block.id,
              direction: 'backward'
            })
          }
        >
          <ArrowDownIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="上移一层"
          onClick={() =>
            dispatch({
              type: 'move-block-layer',
              pageId,
              blockId: block.id,
              direction: 'forward'
            })
          }
        >
          <ArrowUpIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="复制 Block"
          onClick={() => dispatch({ type: 'duplicate-block', pageId, blockId: block.id })}
        >
          <CopyIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="删除 Block"
          className="text-destructive"
          onClick={() => dispatch({ type: 'delete-block', pageId, blockId: block.id })}
        >
          <Trash2Icon />
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
        方向键微移，Shift + 方向键快速移动；Ctrl/Cmd + D 复制。
      </p>
    </Section>
  )
}

function ImageEditContent({
  pageId,
  block
}: {
  pageId: string
  block: ImageBlock
}): React.JSX.Element {
  const dispatch = useStudioStore((state) => state.dispatch)
  const setExclusiveWorkspace = useStudioStore((state) => state.setExclusiveWorkspace)
  const platform = useStudioPlatform()
  const canErasePeople = platform.capabilities.has('erase-people')
  const updateCaption = (caption: ImageCaption): void =>
    dispatch({ type: 'update-image-edit', pageId, blockId: block.id, caption })
  const rotateBy = (amount: number): void =>
    dispatch({
      type: 'set-block-transform',
      pageId,
      blockId: block.id,
      transform: {
        ...block.transform,
        rotationDeg: normalizeRotation(block.transform.rotationDeg + amount)
      }
    })

  return (
    <>
      <Section title="照片">
        <Button className="w-full" onClick={() => setExclusiveWorkspace('image-edit')}>
          <CropIcon data-icon="inline-start" />
          裁剪与美化
        </Button>
        {canErasePeople ? (
          <Button
            className="mt-2 w-full"
            variant="outline"
            onClick={() => setExclusiveWorkspace('erase-people')}
          >
            <Wand2Icon data-icon="inline-start" />
            消除人物
          </Button>
        ) : null}
        <div className="mt-2 grid grid-cols-4 gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="向左旋转 90 度"
            onClick={() => rotateBy(-90)}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="向右旋转 90 度"
            onClick={() => rotateBy(90)}
          >
            <RotateCwIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="水平翻转"
            onClick={() =>
              dispatch({
                type: 'update-image-edit',
                pageId,
                blockId: block.id,
                crop: { ...block.crop, flipX: !block.crop.flipX }
              })
            }
          >
            <FlipHorizontalIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="垂直翻转"
            onClick={() =>
              dispatch({
                type: 'update-image-edit',
                pageId,
                blockId: block.id,
                crop: { ...block.crop, flipY: !block.crop.flipY }
              })
            }
          >
            <FlipVerticalIcon />
          </Button>
        </div>
      </Section>

      <Section title="快速滤镜">
        <div className="grid grid-cols-2 gap-2">
          {IMAGE_EFFECT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="rounded-md border px-2.5 py-2 text-left text-xs hover:border-primary hover:bg-accent"
              onClick={() =>
                dispatch({
                  type: 'apply-effect-preset',
                  pageId,
                  blockId: block.id,
                  presetId: preset.id
                })
              }
            >
              <span
                className="mb-1 block h-5 rounded-sm bg-gradient-to-r from-amber-200 via-rose-300 to-sky-300"
                style={{
                  filter: `brightness(${preset.effects.brightness}) contrast(${preset.effects.contrast}) saturate(${preset.effects.saturation}) grayscale(${preset.effects.grayscale}) sepia(${preset.effects.sepia})`
                }}
              />
              {preset.name}
            </button>
          ))}
        </div>
      </Section>

      <Section title="形状蒙版">
        <div className="grid grid-cols-4 gap-1.5">
          {MASK_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={cn(
                'rounded-md border px-1 py-2 text-[11px] hover:border-primary',
                block.mask.kind === kind && 'border-primary bg-primary/8'
              )}
              onClick={() =>
                dispatch({
                  type: 'update-image-edit',
                  pageId,
                  blockId: block.id,
                  mask: { kind }
                })
              }
            >
              {MASK_NAMES[kind]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="照片说明">
        <label className="mb-2 flex items-center gap-2 text-sm">
          <Checkbox
            checked={block.caption.enabled}
            onCheckedChange={(checked) =>
              updateCaption({ ...block.caption, enabled: checked === true })
            }
          />
          显示说明文字
        </label>
        <DraftInput
          key={block.caption.text}
          label="照片说明"
          value={block.caption.text}
          multiline
          onCommit={(text) => updateCaption({ ...block.caption, text })}
        />
      </Section>
    </>
  )
}

function RichTextEditContent({
  pageId,
  block
}: {
  pageId: string
  block: Extract<Block, { type: 'rich-text' }>
}): React.JSX.Element {
  const richTextDraft = useStudioStore((state) => state.richTextDraft)
  const recentColors = useStudioStore(
    (state) => state.document?.recentColors ?? EMPTY_RECENT_COLORS
  )
  const setRichTextDraft = useStudioStore((state) => state.setRichTextDraft)
  const commitRichTextDraft = useStudioStore((state) => state.commitRichTextDraft)
  const dispatch = useStudioStore((state) => state.dispatch)
  const editorDocument =
    richTextDraft?.pageId === pageId && richTextDraft.blockId === block.id
      ? richTextDraft.document
      : block.document

  return (
    <Section title="文字内容与格式">
      <FieldSet className="mb-3">
        <FieldLegend>排列方向</FieldLegend>
        <ToggleGroup
          aria-label="排列方向"
          onValueChange={(writingMode) => {
            if (
              writingMode === block.writingMode ||
              (writingMode !== 'horizontal' && writingMode !== 'vertical')
            ) {
              return
            }
            commitRichTextDraft()
            dispatch({
              type: 'set-rich-text-writing-mode',
              pageId,
              blockId: block.id,
              writingMode
            })
          }}
          type="single"
          value={block.writingMode}
        >
          <ToggleGroupItem value="horizontal">横排</ToggleGroupItem>
          <ToggleGroupItem value="vertical">竖排</ToggleGroupItem>
        </ToggleGroup>
      </FieldSet>
      <Suspense
        fallback={
          <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            正在打开文字编辑器…
          </div>
        }
      >
        <RichTextEditor
          document={editorDocument}
          onChange={(nextDocument, usedColors) =>
            setRichTextDraft(pageId, block.id, nextDocument, usedColors)
          }
          onBlur={commitRichTextDraft}
          recentColors={recentColors}
          writingMode={block.writingMode}
        />
      </Suspense>
    </Section>
  )
}

function DecorationEditContent({
  pageId,
  block
}: {
  pageId: string
  block: Extract<Block, { type: 'decoration' }>
}): React.JSX.Element {
  const dispatch = useStudioStore((state) => state.dispatch)
  const setRightPanelTab = useStudioStore((state) => state.setRightPanelTab)
  return (
    <>
      <Section title="替换装饰">
        <p className="mb-3 text-xs leading-5 text-muted-foreground">
          在组件库中点击另一个同类装饰，位置、尺寸、旋转和图层会保持不变。
        </p>
        <Button variant="outline" className="w-full" onClick={() => setRightPanelTab('components')}>
          <ShapesIcon data-icon="inline-start" />
          打开组件库
        </Button>
      </Section>
      {block.decoration.kind === 'icon' ? (
        <Section title="图标颜色">
          <label className="flex items-center gap-3 rounded-lg border p-3 text-xs font-medium">
            <PaletteIcon className="size-4 text-muted-foreground" />
            <Input
              type="color"
              aria-label="图标颜色"
              value={block.decoration.color}
              className="h-8 w-14 cursor-pointer p-1"
              onChange={(event) =>
                dispatch({
                  type: 'set-icon-color',
                  pageId,
                  blockId: block.id,
                  color: event.target.value
                })
              }
            />
            <span className="font-mono text-muted-foreground">{block.decoration.color}</span>
          </label>
        </Section>
      ) : null}
    </>
  )
}

export function BlockEditPanel(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedBlockId = useStudioStore((state) => state.selectedBlockId)
  const page = document?.pages.find((candidate) => candidate.id === selectedPageId)
  const block = page?.blocks.find((candidate) => candidate.id === selectedBlockId)

  if (!page || !block) {
    return (
      <div className="grid min-h-52 place-items-center p-6 text-center text-xs leading-5 text-muted-foreground">
        在画布上选中一个 Block 后，可在这里编辑内容和样式。
      </div>
    )
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between rounded-lg border bg-muted/35 px-3 py-2">
        <span className="text-xs font-semibold">{BLOCK_TYPE_NAMES[block.type]}</span>
        <span className="max-w-32 truncate font-mono text-[10px] text-muted-foreground">
          {block.id}
        </span>
      </div>
      {block.type === 'image' ? (
        <ImageEditContent pageId={page.id} block={block} />
      ) : block.type === 'rich-text' ? (
        <RichTextEditContent pageId={page.id} block={block} />
      ) : (
        <DecorationEditContent pageId={page.id} block={block} />
      )}
      <BlockActions pageId={page.id} block={block} />
    </div>
  )
}
