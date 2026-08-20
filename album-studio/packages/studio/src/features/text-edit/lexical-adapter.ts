import {
  HexColorSchema,
  MAX_RICH_TEXT_CHARACTERS,
  MAX_RICH_TEXT_NODES,
  RichTextDocumentSchema,
  RichTextFontFamilySchema,
  RichTextFormatSchema,
  type AlbumTextNode,
  type RichTextAlignment,
  type RichTextDocument,
  type RichTextFontFamily,
  type RichTextListItemNode,
  type RichTextListNode,
  type RichTextParagraphNode
} from '@album-studio/common'
import { createState } from 'lexical'
import { richTextCssToFontFamily, richTextFontFamilyToCss } from './rich-text-fonts'

const DEFAULT_FONT_FAMILY: RichTextFontFamily = 'sans'
const DEFAULT_FONT_SIZE = 18
const DEFAULT_COLOR = '#201f1b'
export const DEFAULT_RICH_TEXT_LINE_HEIGHT = 1.5

const LINE_HEIGHT_STATE_KEY = 'albumLineHeight'

type LexicalNodeState = Readonly<{
  [LINE_HEIGHT_STATE_KEY]: number
}>

type LexicalTextNode = Readonly<{
  type: 'text'
  version: 1
  detail: 0
  format: number
  mode: 'normal'
  style: string
  text: string
}>

type LexicalElementFields = Readonly<{
  direction: null
  format: '' | RichTextAlignment
  indent: 0
  textFormat?: number
  textStyle?: string
  $?: LexicalNodeState
}>

type LexicalParagraphNode = LexicalElementFields &
  Readonly<{
    type: 'paragraph'
    version: 1
    children: LexicalTextNode[]
    textFormat: number
    textStyle: string
  }>

type LexicalListItemNode = Omit<LexicalElementFields, '$'> &
  Readonly<{
    type: 'listitem'
    version: 1
    checked?: undefined
    value: number
    children: LexicalTextNode[]
  }>

type LexicalListNode = LexicalElementFields &
  Readonly<{
    type: 'list'
    version: 1
    listType: 'bullet' | 'number'
    start: number
    tag: 'ul' | 'ol'
    children: LexicalListItemNode[]
  }>

type LexicalRootNode = Readonly<{
  type: 'root'
  version: 1
  direction: null
  format: ''
  indent: 0
  children: Array<LexicalParagraphNode | LexicalListNode>
}>

export type AlbumLexicalEditorState = Readonly<{
  root: LexicalRootNode
}>

type ParsedTextStyle = Readonly<{
  fontFamily: RichTextFontFamily
  fontSize: number
  color: string
}>

type ParseBudget = {
  nodes: number
  characters: number
}

function invalid(message: string): never {
  throw new Error(`无效的 Lexical 富文本：${message}`)
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return invalid(`${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string
): void {
  const allowed = new Set(allowedKeys)
  const unknownKey = Object.keys(value).find((key) => !allowed.has(key))
  if (unknownKey !== undefined) invalid(`${label} 包含未知字段 ${unknownKey}`)
}

function assertTypeAndVersion(
  value: Record<string, unknown>,
  type: 'root' | 'paragraph' | 'list' | 'listitem' | 'text',
  label: string
): void {
  if (value.type !== type) invalid(`${label} 节点类型必须是 ${type}`)
  if (value.version !== 1) invalid(`${label} 节点版本必须是 1`)
}

function asChildren(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) invalid(`${label}.children 必须是数组`)
  return value
}

function consumeNode(budget: ParseBudget): void {
  budget.nodes += 1
  if (budget.nodes > MAX_RICH_TEXT_NODES) invalid(`节点数超过 ${MAX_RICH_TEXT_NODES}`)
}

function consumeText(budget: ParseBudget, text: string): void {
  budget.characters += text.length
  if (budget.characters > MAX_RICH_TEXT_CHARACTERS) {
    invalid(`文字数超过 ${MAX_RICH_TEXT_CHARACTERS}`)
  }
}

function parseAlignment(value: unknown, label: string): '' | RichTextAlignment {
  if (value === '') return ''
  if (value === 'left' || value === 'center' || value === 'right') return value
  return invalid(`${label}.format 只支持左、中、右对齐`)
}

function validateElementFields(value: Record<string, unknown>, label: string): void {
  if (value.direction !== null) invalid(`${label}.direction 必须是 null`)
  parseAlignment(value.format, label)
  if (value.indent !== 0) invalid(`${label}.indent 必须是 0`)

  if ('textFormat' in value) RichTextFormatSchema.parse(value.textFormat)
  if ('textStyle' in value) {
    if (value.textStyle !== '') parseLexicalTextStyle(value.textStyle)
  }
}

function parseLineHeight(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 2.5) {
    return invalid('行距必须在 1–2.5 之间')
  }
  return value
}

function parseNodeLineHeight(value: Record<string, unknown>, label: string): number {
  if (!('$' in value)) return DEFAULT_RICH_TEXT_LINE_HEIGHT
  const state = asRecord(value.$, `${label}.$`)
  assertExactKeys(state, [LINE_HEIGHT_STATE_KEY], `${label}.$`)
  if (!(LINE_HEIGHT_STATE_KEY in state)) invalid(`${label}.$ 缺少行距`)
  return parseLineHeight(state[LINE_HEIGHT_STATE_KEY])
}

export const albumLineHeightState = createState(LINE_HEIGHT_STATE_KEY, {
  parse: (value) => (value === undefined ? DEFAULT_RICH_TEXT_LINE_HEIGHT : parseLineHeight(value))
})

export function createLexicalTextStyle({ fontFamily, fontSize, color }: ParsedTextStyle): string {
  const parsedFamily = RichTextFontFamilySchema.parse(fontFamily)
  const parsedSize = Number(fontSize)
  if (!Number.isFinite(parsedSize) || parsedSize < 8 || parsedSize > 120) {
    invalid('字号必须在 8–120 之间')
  }
  const parsedColor = HexColorSchema.parse(color)
  return `font-family: ${richTextFontFamilyToCss(parsedFamily)};font-size: ${parsedSize}px;color: ${parsedColor};`
}

export function parseLexicalTextStyle(value: unknown): ParsedTextStyle {
  if (typeof value !== 'string') invalid('文字 style 必须是字符串')

  const declarations = value
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
  if (declarations.length > 3) invalid('文字 style 只能包含字体、字号和颜色')

  const styles = new Map<string, string>()
  for (const declaration of declarations) {
    const separator = declaration.indexOf(':')
    if (separator <= 0 || declaration.indexOf(':', separator + 1) !== -1) {
      invalid('文字 style 格式不合法')
    }
    const property = declaration.slice(0, separator).trim()
    const propertyValue = declaration.slice(separator + 1).trim()
    if (!['font-family', 'font-size', 'color'].includes(property)) {
      invalid(`文字 style 包含未知属性 ${property}`)
    }
    if (styles.has(property) || propertyValue === '') invalid('文字 style 属性重复或为空')
    styles.set(property, propertyValue)
  }

  const fontFamily = richTextCssToFontFamily(
    styles.get('font-family') ?? richTextFontFamilyToCss(DEFAULT_FONT_FAMILY)
  )
  if (fontFamily === undefined) invalid('文字 style 包含未受控字体')

  const fontSizeValue = styles.get('font-size') ?? `${DEFAULT_FONT_SIZE}px`
  if (!/^\d+(?:\.\d+)?px$/.test(fontSizeValue)) invalid('文字 style 字号格式不合法')
  const fontSize = Number(fontSizeValue.slice(0, -2))
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 120) {
    invalid('文字 style 字号超出范围')
  }

  const color = HexColorSchema.parse(styles.get('color') ?? DEFAULT_COLOR)
  return { fontFamily, fontSize, color }
}

const DEFAULT_LEXICAL_TEXT_STYLE = createLexicalTextStyle({
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  color: DEFAULT_COLOR
})

function toLexicalTextNode(node: AlbumTextNode): LexicalTextNode {
  return {
    detail: 0,
    format: node.format,
    mode: 'normal',
    style: createLexicalTextStyle(node),
    text: node.text,
    type: 'text',
    version: 1
  }
}

function lineHeightState(lineHeight: number): Pick<LexicalElementFields, '$'> {
  return lineHeight === DEFAULT_RICH_TEXT_LINE_HEIGHT
    ? {}
    : { $: { [LINE_HEIGHT_STATE_KEY]: lineHeight } }
}

function toLexicalParagraphNode(node: RichTextParagraphNode): LexicalParagraphNode {
  const children = node.children.map(toLexicalTextNode)
  const firstChild = children[0]
  return {
    children,
    direction: null,
    format: node.align,
    indent: 0,
    textFormat: firstChild?.format ?? 0,
    textStyle: firstChild?.style ?? DEFAULT_LEXICAL_TEXT_STYLE,
    type: 'paragraph',
    version: 1,
    ...lineHeightState(node.lineHeight)
  }
}

function toLexicalListItemNode(
  node: RichTextListItemNode,
  align: RichTextAlignment
): LexicalListItemNode {
  const children = node.children.map(toLexicalTextNode)
  const firstChild = children[0]
  return {
    checked: undefined,
    children,
    direction: null,
    format: align,
    indent: 0,
    ...(firstChild === undefined ? { textFormat: 0, textStyle: DEFAULT_LEXICAL_TEXT_STYLE } : {}),
    type: 'listitem',
    value: node.value,
    version: 1
  }
}

function toLexicalListNode(node: RichTextListNode): LexicalListNode {
  return {
    children: node.children.map((item) => toLexicalListItemNode(item, node.align)),
    direction: null,
    format: node.align,
    indent: 0,
    listType: node.listType,
    start: node.start,
    tag: node.listType === 'number' ? 'ol' : 'ul',
    type: 'list',
    version: 1,
    ...lineHeightState(node.lineHeight)
  }
}

export function richTextDocumentToLexicalEditorState(
  input: RichTextDocument
): AlbumLexicalEditorState {
  const document = RichTextDocumentSchema.parse(input)
  return {
    root: {
      children: document.root.children.map((node) =>
        node.type === 'paragraph' ? toLexicalParagraphNode(node) : toLexicalListNode(node)
      ),
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1
    }
  }
}

function parseTextNode(input: unknown, label: string, budget: ParseBudget): AlbumTextNode {
  consumeNode(budget)
  const node = asRecord(input, label)
  assertExactKeys(node, ['detail', 'format', 'mode', 'style', 'text', 'type', 'version'], label)
  assertTypeAndVersion(node, 'text', label)
  if (node.detail !== 0) invalid(`${label}.detail 必须是 0`)
  if (node.mode !== 'normal') invalid(`${label}.mode 必须是 normal`)
  if (typeof node.text !== 'string') invalid(`${label}.text 必须是字符串`)
  consumeText(budget, node.text)

  const format = RichTextFormatSchema.parse(node.format)
  const style = parseLexicalTextStyle(node.style)
  return {
    type: 'album-text',
    version: 1,
    text: node.text,
    format,
    ...style
  }
}

function parseParagraphNode(
  input: unknown,
  label: string,
  budget: ParseBudget
): RichTextParagraphNode {
  consumeNode(budget)
  const node = asRecord(input, label)
  assertExactKeys(
    node,
    [
      '$',
      'children',
      'direction',
      'format',
      'indent',
      'textFormat',
      'textStyle',
      'type',
      'version'
    ],
    label
  )
  assertTypeAndVersion(node, 'paragraph', label)
  validateElementFields(node, label)

  return {
    type: 'paragraph',
    version: 1,
    align: parseAlignment(node.format, label) || 'left',
    lineHeight: parseNodeLineHeight(node, label),
    children: asChildren(node.children, label).map((child, index) =>
      parseTextNode(child, `${label}.children[${index}]`, budget)
    )
  }
}

function parseListItemNode(
  input: unknown,
  label: string,
  budget: ParseBudget
): Readonly<{ node: RichTextListItemNode; align: '' | RichTextAlignment }> {
  consumeNode(budget)
  const item = asRecord(input, label)
  assertExactKeys(
    item,
    [
      'checked',
      'children',
      'direction',
      'format',
      'indent',
      'textFormat',
      'textStyle',
      'type',
      'value',
      'version'
    ],
    label
  )
  assertTypeAndVersion(item, 'listitem', label)
  validateElementFields(item, label)
  if ('checked' in item && item.checked !== undefined) {
    invalid(`${label}.checked 只适用于未支持的任务列表`)
  }
  if (!Number.isInteger(item.value) || (item.value as number) <= 0) {
    invalid(`${label}.value 必须是正整数`)
  }

  return {
    align: parseAlignment(item.format, label),
    node: {
      type: 'listitem',
      version: 1,
      value: item.value as number,
      children: asChildren(item.children, label).map((child, index) =>
        parseTextNode(child, `${label}.children[${index}]`, budget)
      )
    }
  }
}

function parseListNode(input: unknown, label: string, budget: ParseBudget): RichTextListNode {
  consumeNode(budget)
  const list = asRecord(input, label)
  assertExactKeys(
    list,
    [
      '$',
      'children',
      'direction',
      'format',
      'indent',
      'listType',
      'start',
      'tag',
      'textFormat',
      'textStyle',
      'type',
      'version'
    ],
    label
  )
  assertTypeAndVersion(list, 'list', label)
  validateElementFields(list, label)
  if (list.listType !== 'bullet' && list.listType !== 'number') {
    invalid(`${label}.listType 只支持 bullet 和 number`)
  }
  const expectedTag = list.listType === 'number' ? 'ol' : 'ul'
  if (list.tag !== expectedTag) invalid(`${label}.tag 与列表类型不一致`)
  if (!Number.isInteger(list.start) || (list.start as number) <= 0) {
    invalid(`${label}.start 必须是正整数`)
  }

  const items = asChildren(list.children, label).map((child, index) =>
    parseListItemNode(child, `${label}.children[${index}]`, budget)
  )
  const explicitAlignments = [
    parseAlignment(list.format, label),
    ...items.map((item) => item.align)
  ].filter((align): align is RichTextAlignment => align !== '')
  const align = explicitAlignments[0] ?? 'left'
  if (explicitAlignments.some((candidate) => candidate !== align)) {
    invalid(`${label} 中的列表项对齐方式不一致`)
  }

  return {
    type: 'list',
    version: 1,
    listType: list.listType,
    start: list.start as number,
    align,
    lineHeight: parseNodeLineHeight(list, label),
    children: items.map((item) => item.node)
  }
}

export function lexicalEditorStateToRichTextDocument(input: unknown): RichTextDocument {
  const editorState = asRecord(input, 'EditorState')
  assertExactKeys(editorState, ['root'], 'EditorState')
  if (!('root' in editorState)) invalid('EditorState 缺少 root')

  const root = asRecord(editorState.root, 'root')
  assertExactKeys(root, ['children', 'direction', 'format', 'indent', 'type', 'version'], 'root')
  assertTypeAndVersion(root, 'root', 'root')
  if (root.direction !== null || root.format !== '' || root.indent !== 0) {
    invalid('root 包含不受支持的元素格式')
  }

  const budget: ParseBudget = { nodes: 1, characters: 0 }
  const children = asChildren(root.children, 'root').map((child, index) => {
    const node = asRecord(child, `root.children[${index}]`)
    if (node.type === 'paragraph') {
      return parseParagraphNode(node, `root.children[${index}]`, budget)
    }
    if (node.type === 'list') return parseListNode(node, `root.children[${index}]`, budget)
    return invalid(`root.children[${index}] 节点类型未受支持`)
  })

  return RichTextDocumentSchema.parse({
    version: 1,
    root: { type: 'root', version: 1, children }
  })
}
