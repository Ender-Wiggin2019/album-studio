import {
  RICH_TEXT_FONT_FAMILIES,
  type RichTextAlignment,
  type RichTextFontFamily
} from '@album-studio/common'
import {
  $isListItemNode,
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND
} from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getSelectionStyleValueForProperty, $patchStyleText } from '@lexical/selection'
import {
  $getSelection,
  $getState,
  $isParagraphNode,
  $isRangeSelection,
  $setSelection,
  $setState,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalNode,
  type ParagraphNode,
  type RangeSelection,
  type TextFormatType
} from 'lexical'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  UnderlineIcon
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DEFAULT_RICH_TEXT_LINE_HEIGHT,
  RICH_TEXT_FONT_FAMILY_CSS,
  albumLineHeightState,
  richTextFontFamilyToCss
} from './lexical-adapter'

type SupportedBlock = ParagraphNode | ListNode
type SupportedListType = 'bullet' | 'number'

type ToolbarState = Readonly<{
  fontFamily: RichTextFontFamily
  fontSize: number
  color: string
  bold: boolean
  italic: boolean
  underline: boolean
  align: RichTextAlignment
  lineHeight: number
  listType: SupportedListType | null
}>

const DEFAULT_TOOLBAR_STATE: ToolbarState = Object.freeze({
  fontFamily: 'sans',
  fontSize: 18,
  color: '#201f1b',
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  lineHeight: DEFAULT_RICH_TEXT_LINE_HEIGHT,
  listType: null
})

const FONT_LABELS: Readonly<Record<RichTextFontFamily, string>> = Object.freeze({
  serif: '衬线',
  sans: '无衬线',
  handwritten: '手写',
  mono: '等宽'
})

const CSS_TO_FONT_FAMILY = new Map(
  Object.entries(RICH_TEXT_FONT_FAMILY_CSS).map(([family, css]) => [
    css,
    family as RichTextFontFamily
  ])
)

function sameToolbarState(left: ToolbarState, right: ToolbarState): boolean {
  return (
    left.fontFamily === right.fontFamily &&
    left.fontSize === right.fontSize &&
    left.color === right.color &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.align === right.align &&
    left.lineHeight === right.lineHeight &&
    left.listType === right.listType
  )
}

function $findSupportedBlock(node: LexicalNode): SupportedBlock | null {
  let current: LexicalNode | null = node
  while (current !== null) {
    if ($isParagraphNode(current) || $isListNode(current)) return current
    if ($isListItemNode(current)) {
      const parent = current.getParent()
      if ($isListNode(parent)) return parent
    }
    current = current.getParent()
  }
  return null
}

function $getSelectedBlocks(selection: RangeSelection): SupportedBlock[] {
  const blocks = new Map<string, SupportedBlock>()
  const nodes = [...selection.getNodes(), selection.anchor.getNode(), selection.focus.getNode()]
  for (const node of nodes) {
    const block = $findSupportedBlock(node)
    if (block !== null) blocks.set(block.getKey(), block)
  }
  return [...blocks.values()]
}

function normalizeFontSize(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed >= 8 && parsed <= 120 ? parsed : 18
}

function normalizeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#201f1b'
}

type NumericControlProps = Readonly<{
  label: string
  value: number
  min: number
  max: number
  step: number
  className: string
  onValidChange: (value: number) => void
}>

function NumericControl({
  label,
  value,
  min,
  max,
  step,
  className,
  onValidChange
}: NumericControlProps): React.JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(String(value))
  }, [value])

  const reset = (): void => setDraft(String(value))
  const apply = (nextDraft: string): void => {
    setDraft(nextDraft)
    const nextValue = Number(nextDraft)
    if (Number.isFinite(nextValue) && nextValue >= min && nextValue <= max) {
      onValidChange(nextValue)
    }
  }

  return (
    <Input
      aria-label={label}
      className={className}
      inputMode="decimal"
      max={max}
      min={min}
      onBlur={() => {
        focused.current = false
        reset()
      }}
      onChange={(event) => apply(event.currentTarget.value)}
      onFocus={() => {
        focused.current = true
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          reset()
          event.currentTarget.blur()
        }
      }}
      step={step}
      title={label}
      type="number"
      value={draft}
    />
  )
}

function preserveEditorFocus(event: React.MouseEvent): void {
  event.preventDefault()
}

export function RichTextToolbar(): React.JSX.Element {
  const [editor] = useLexicalComposerContext()
  const [toolbar, setToolbar] = useState<ToolbarState>(DEFAULT_TOOLBAR_STATE)
  const lastSelection = useRef<RangeSelection | null>(null)

  const updateToolbar = useCallback(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return
    lastSelection.current = selection.clone()

    const blocks = $getSelectedBlocks(selection)
    const firstBlock = blocks[0]
    const fontCss = $getSelectionStyleValueForProperty(
      selection,
      'font-family',
      richTextFontFamilyToCss('sans')
    )
    const fontSizeCss = $getSelectionStyleValueForProperty(selection, 'font-size', '18px')
    const colorCss = $getSelectionStyleValueForProperty(selection, 'color', '#201f1b')
    const format = firstBlock?.getFormatType()
    const currentListType = $isListNode(firstBlock) ? firstBlock.getListType() : null
    const nextState: ToolbarState = {
      fontFamily: CSS_TO_FONT_FAMILY.get(fontCss) ?? 'sans',
      fontSize: normalizeFontSize(fontSizeCss),
      color: normalizeColor(colorCss),
      bold: selection.hasFormat('bold'),
      italic: selection.hasFormat('italic'),
      underline: selection.hasFormat('underline'),
      align: format === 'center' || format === 'right' ? format : 'left',
      lineHeight:
        firstBlock === undefined
          ? DEFAULT_RICH_TEXT_LINE_HEIGHT
          : $getState(firstBlock, albumLineHeightState),
      listType:
        currentListType === 'bullet' || currentListType === 'number' ? currentListType : null
    }
    setToolbar((current) => (sameToolbarState(current, nextState) ? current : nextState))
  }, [])

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(updateToolbar)
      }),
    [editor, updateToolbar]
  )

  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateToolbar()
          return false
        },
        COMMAND_PRIORITY_LOW
      ),
    [editor, updateToolbar]
  )

  const withSelection = useCallback(
    (change: (selection: RangeSelection) => void): void => {
      editor.update(() => {
        let selection = $getSelection()
        if (!$isRangeSelection(selection) && lastSelection.current !== null) {
          const restored = lastSelection.current.clone()
          try {
            restored.anchor.getNode()
            restored.focus.getNode()
            $setSelection(restored)
            selection = restored
          } catch {
            lastSelection.current = null
          }
        }
        if ($isRangeSelection(selection)) change(selection)
      })
    },
    [editor]
  )

  const patchTextStyle = useCallback(
    (property: 'color' | 'font-family' | 'font-size', value: string): void => {
      withSelection((selection) => $patchStyleText(selection, { [property]: value }))
    },
    [withSelection]
  )

  const toggleTextFormat = useCallback(
    (format: Extract<TextFormatType, 'bold' | 'italic' | 'underline'>): void => {
      withSelection(() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format))
    },
    [editor, withSelection]
  )

  const setAlignment = useCallback(
    (align: RichTextAlignment): void => {
      withSelection((selection) => {
        for (const block of $getSelectedBlocks(selection)) {
          block.setFormat(align)
          if ($isListNode(block)) {
            for (const child of block.getChildren()) {
              if ($isListItemNode(child)) child.setFormat(align)
            }
          }
        }
      })
    },
    [withSelection]
  )

  const setLineHeight = useCallback(
    (lineHeight: number): void => {
      withSelection((selection) => {
        for (const block of $getSelectedBlocks(selection)) {
          $setState(block, albumLineHeightState, lineHeight)
        }
      })
    },
    [withSelection]
  )

  const toggleList = useCallback(
    (listType: SupportedListType): void => {
      const previousAlign = toolbar.align
      const previousLineHeight = toolbar.lineHeight
      withSelection(() => {
        if (toolbar.listType === listType) {
          editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
        } else {
          editor.dispatchCommand(
            listType === 'bullet' ? INSERT_UNORDERED_LIST_COMMAND : INSERT_ORDERED_LIST_COMMAND,
            undefined
          )
        }

        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return
        for (const block of $getSelectedBlocks(selection)) {
          block.setFormat(previousAlign)
          $setState(block, albumLineHeightState, previousLineHeight)
          if ($isListNode(block)) {
            for (const child of block.getChildren()) {
              if ($isListItemNode(child)) child.setFormat(previousAlign)
            }
          }
        }
      })
    },
    [editor, toolbar.align, toolbar.lineHeight, toolbar.listType, withSelection]
  )

  const textFormats = [
    toolbar.bold ? 'bold' : null,
    toolbar.italic ? 'italic' : null,
    toolbar.underline ? 'underline' : null
  ].filter((format): format is string => format !== null)

  return (
    <div
      aria-label="文字格式"
      className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-1.5"
      role="toolbar"
    >
      <Select
        onValueChange={(value) => {
          if ((RICH_TEXT_FONT_FAMILIES as readonly string[]).includes(value)) {
            patchTextStyle('font-family', richTextFontFamilyToCss(value as RichTextFontFamily))
          }
        }}
        value={toolbar.fontFamily}
      >
        <SelectTrigger aria-label="字体" className="w-28" title="字体">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {RICH_TEXT_FONT_FAMILIES.map((family) => (
              <SelectItem key={family} value={family}>
                {FONT_LABELS[family]}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <NumericControl
        className="w-20"
        label="字号"
        max={120}
        min={8}
        onValidChange={(fontSize) => patchTextStyle('font-size', `${fontSize}px`)}
        step={1}
        value={toolbar.fontSize}
      />

      <Input
        aria-label="文字颜色"
        className="size-9 shrink-0 p-1"
        onChange={(event) => patchTextStyle('color', event.currentTarget.value)}
        title="文字颜色"
        type="color"
        value={toolbar.color}
      />

      <ToggleGroup aria-label="文字样式" type="multiple" value={textFormats}>
        <ToggleGroupItem
          aria-label="粗体"
          className="[&_svg]:size-4"
          onClick={() => toggleTextFormat('bold')}
          onMouseDown={preserveEditorFocus}
          title="粗体"
          value="bold"
        >
          <BoldIcon aria-hidden="true" data-icon="inline-start" />
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label="斜体"
          className="[&_svg]:size-4"
          onClick={() => toggleTextFormat('italic')}
          onMouseDown={preserveEditorFocus}
          title="斜体"
          value="italic"
        >
          <ItalicIcon aria-hidden="true" data-icon="inline-start" />
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label="下划线"
          className="[&_svg]:size-4"
          onClick={() => toggleTextFormat('underline')}
          onMouseDown={preserveEditorFocus}
          title="下划线"
          value="underline"
        >
          <UnderlineIcon aria-hidden="true" data-icon="inline-start" />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup aria-label="对齐方式" type="single" value={toolbar.align}>
        <ToggleGroupItem
          aria-label="左对齐"
          className="[&_svg]:size-4"
          onClick={() => setAlignment('left')}
          onMouseDown={preserveEditorFocus}
          title="左对齐"
          value="left"
        >
          <AlignLeftIcon aria-hidden="true" data-icon="inline-start" />
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label="居中对齐"
          className="[&_svg]:size-4"
          onClick={() => setAlignment('center')}
          onMouseDown={preserveEditorFocus}
          title="居中对齐"
          value="center"
        >
          <AlignCenterIcon aria-hidden="true" data-icon="inline-start" />
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label="右对齐"
          className="[&_svg]:size-4"
          onClick={() => setAlignment('right')}
          onMouseDown={preserveEditorFocus}
          title="右对齐"
          value="right"
        >
          <AlignRightIcon aria-hidden="true" data-icon="inline-start" />
        </ToggleGroupItem>
      </ToggleGroup>

      <NumericControl
        className="w-20"
        label="行距"
        max={2.5}
        min={1}
        onValidChange={setLineHeight}
        step={0.1}
        value={toolbar.lineHeight}
      />

      <ToggleGroup aria-label="列表类型" type="single" value={toolbar.listType ?? ''}>
        <ToggleGroupItem
          aria-label="项目符号列表"
          className="[&_svg]:size-4"
          onClick={() => toggleList('bullet')}
          onMouseDown={preserveEditorFocus}
          title="项目符号列表"
          value="bullet"
        >
          <ListIcon aria-hidden="true" data-icon="inline-start" />
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-label="编号列表"
          className="[&_svg]:size-4"
          onClick={() => toggleList('number')}
          onMouseDown={preserveEditorFocus}
          title="编号列表"
          value="number"
        >
          <ListOrderedIcon aria-hidden="true" data-icon="inline-start" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
