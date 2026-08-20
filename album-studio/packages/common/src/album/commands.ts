import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'
import { z } from 'zod'
import {
  arrangeImageBlocksFree,
  createContentPage,
  createDecorationBlock,
  createImageBlock,
  createRichTextBlock,
  DEFAULT_IMAGE_BLOCK_TRANSFORM,
  fitImageBlockSize,
  type IdFactory
} from './create'
import { applyImageEffectPreset, ImageEffectPresetIdSchema } from './effects'
import { fitBlockTransformToCrop } from './crop'
import { collectRichTextColors, mergeRecentColors } from './colors'
import { FREE_FORM_LAYOUT_ID, getPageLayout } from './layouts'
import {
  AlbumDocumentSchema,
  AssetRecordSchema,
  BlockSchema,
  BlockTransformSchema,
  DecorationSchema,
  HexColorSchema,
  ImageCaptionSchema,
  ImageCropSchema,
  ImageEffectsSchema,
  ImageEraseSchema,
  ImageMaskSchema,
  MAX_RECENT_COLORS,
  PageLayoutIdSchema,
  RichTextDocumentSchema,
  RichTextWritingModeSchema,
  ThemeIdSchema,
  type AlbumDocument,
  type AlbumPage,
  type Block,
  type BlockTransform,
  type ImageBlock,
  type PageLayoutId,
  transformsEqual
} from './schema'

enablePatches()

const id = z.string().min(1)

const RegisterAssetsCommandSchema = z
  .object({
    type: z.literal('register-assets'),
    assets: z.array(AssetRecordSchema).min(1)
  })
  .strict()

const AddPageCommandSchema = z
  .object({
    type: z.literal('add-page'),
    afterPageId: id.optional(),
    assetIds: z.array(id).max(100).optional(),
    layoutId: PageLayoutIdSchema.optional()
  })
  .strict()

const DeletePageCommandSchema = z.object({ type: z.literal('delete-page'), pageId: id }).strict()

const ReorderPageCommandSchema = z
  .object({
    type: z.literal('reorder-page'),
    pageId: id,
    toIndex: z.number().int().min(1)
  })
  .strict()

const PlaceAssetsCommandSchema = z
  .object({
    type: z.literal('place-assets'),
    pageId: id,
    assetIds: z.array(id).min(1).max(100),
    layoutId: PageLayoutIdSchema.optional()
  })
  .strict()

const AddBlockInputSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('image'),
      assetId: id,
      transform: BlockTransformSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('rich-text'),
      document: RichTextDocumentSchema,
      transform: BlockTransformSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('decoration'),
      decoration: DecorationSchema,
      transform: BlockTransformSchema.optional()
    })
    .strict()
])
type AddBlockInput = z.infer<typeof AddBlockInputSchema>

const AddBlockCommandSchema = z
  .object({
    type: z.literal('add-block'),
    pageId: id,
    block: AddBlockInputSchema
  })
  .strict()

const SetBlockTransformCommandSchema = z
  .object({
    type: z.literal('set-block-transform'),
    pageId: id,
    blockId: id,
    transform: BlockTransformSchema
  })
  .strict()

const MoveBlockLayerCommandSchema = z
  .object({
    type: z.literal('move-block-layer'),
    pageId: id,
    blockId: id,
    direction: z.enum(['forward', 'backward', 'front', 'back'])
  })
  .strict()

const MoveImageBlockToPageCommandSchema = z
  .object({
    type: z.literal('move-image-block-to-page'),
    sourcePageId: id,
    targetPageId: id,
    blockId: id
  })
  .strict()

const DuplicateBlockCommandSchema = z
  .object({ type: z.literal('duplicate-block'), pageId: id, blockId: id })
  .strict()

const DeleteBlockCommandSchema = z
  .object({ type: z.literal('delete-block'), pageId: id, blockId: id })
  .strict()

const UpdateRichTextCommandSchema = z
  .object({
    type: z.literal('update-rich-text'),
    pageId: id,
    blockId: id,
    document: RichTextDocumentSchema,
    usedColors: z.array(HexColorSchema).max(MAX_RECENT_COLORS).optional()
  })
  .strict()

const SetRichTextWritingModeCommandSchema = z
  .object({
    type: z.literal('set-rich-text-writing-mode'),
    pageId: id,
    blockId: id,
    writingMode: RichTextWritingModeSchema
  })
  .strict()

const UpdateImageEditCommandSchema = z
  .object({
    type: z.literal('update-image-edit'),
    pageId: id,
    blockId: id,
    crop: ImageCropSchema.optional(),
    effects: ImageEffectsSchema.optional(),
    mask: ImageMaskSchema.optional(),
    caption: ImageCaptionSchema.optional()
  })
  .strict()
  .refine(
    (command) =>
      command.crop !== undefined ||
      command.effects !== undefined ||
      command.mask !== undefined ||
      command.caption !== undefined,
    { message: '图片编辑命令至少要包含一项修改' }
  )

const ApplyEffectPresetCommandSchema = z
  .object({
    type: z.literal('apply-effect-preset'),
    pageId: id,
    blockId: id,
    presetId: ImageEffectPresetIdSchema
  })
  .strict()

const SetImageEraseCommandSchema = z
  .object({
    type: z.literal('set-image-erase'),
    pageId: id,
    blockId: id,
    erase: ImageEraseSchema
  })
  .strict()

const ClearImageEraseCommandSchema = z
  .object({
    type: z.literal('clear-image-erase'),
    pageId: id,
    blockId: id
  })
  .strict()

const ReplaceDecorationCommandSchema = z
  .object({
    type: z.literal('replace-decoration'),
    pageId: id,
    blockId: id,
    decoration: DecorationSchema
  })
  .strict()

const SetIconColorCommandSchema = z
  .object({
    type: z.literal('set-icon-color'),
    pageId: id,
    blockId: id,
    color: HexColorSchema
  })
  .strict()

const ApplyPageLayoutCommandSchema = z
  .object({
    type: z.literal('apply-page-layout'),
    pageId: id,
    layoutId: PageLayoutIdSchema
  })
  .strict()

const SetThemeCommandSchema = z
  .object({ type: z.literal('set-theme'), themeId: ThemeIdSchema })
  .strict()

const SetProjectTitleCommandSchema = z
  .object({
    type: z.literal('set-project-title'),
    title: z.string().trim().min(1).max(160)
  })
  .strict()

export const AlbumCommandSchema = z.discriminatedUnion('type', [
  RegisterAssetsCommandSchema,
  AddPageCommandSchema,
  DeletePageCommandSchema,
  ReorderPageCommandSchema,
  PlaceAssetsCommandSchema,
  AddBlockCommandSchema,
  SetBlockTransformCommandSchema,
  MoveBlockLayerCommandSchema,
  MoveImageBlockToPageCommandSchema,
  DuplicateBlockCommandSchema,
  DeleteBlockCommandSchema,
  UpdateRichTextCommandSchema,
  SetRichTextWritingModeCommandSchema,
  UpdateImageEditCommandSchema,
  ApplyEffectPresetCommandSchema,
  SetImageEraseCommandSchema,
  ClearImageEraseCommandSchema,
  ReplaceDecorationCommandSchema,
  SetIconColorCommandSchema,
  ApplyPageLayoutCommandSchema,
  SetThemeCommandSchema,
  SetProjectTitleCommandSchema
])
export type AlbumCommand = z.infer<typeof AlbumCommandSchema>

export type AlbumPatch = Patch

export type AlbumCommandResult = Readonly<{
  document: AlbumDocument
  patches: readonly AlbumPatch[]
  inversePatches: readonly AlbumPatch[]
}>

export type AlbumCommandOptions = Readonly<{
  now?: string
  idFactory?: IdFactory
}>

export type AlbumCommandErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_TARGET'
  | 'ASSET_MISSING'
  | 'ASSET_CONFLICT'
  | 'LAYOUT_MISMATCH'
  | 'PAGE_LIMIT'

export class AlbumCommandError extends Error {
  readonly code: AlbumCommandErrorCode

  constructor(code: AlbumCommandErrorCode, message: string) {
    super(message)
    this.name = 'AlbumCommandError'
    this.code = code
  }
}

type DocumentDraft = Draft<AlbumDocument>
type PageDraft = Draft<AlbumPage>
type BlockDraft = Draft<Block>

function commandError(code: AlbumCommandErrorCode, message: string): never {
  throw new AlbumCommandError(code, message)
}

function requireAsset(document: DocumentDraft, assetId: string): void {
  if (!document.assets.some((asset) => asset.id === assetId)) {
    commandError('ASSET_MISSING', `素材不存在：${assetId}`)
  }
}

function requirePage(document: DocumentDraft, pageId: string): PageDraft {
  const page = document.pages.find((candidate) => candidate.id === pageId)
  if (!page) commandError('NOT_FOUND', `页面不存在：${pageId}`)
  return page
}

function findBlock(
  document: DocumentDraft,
  pageId: string,
  blockId: string
): { page: PageDraft; block: BlockDraft; index: number } {
  const page = requirePage(document, pageId)
  const index = page.blocks.findIndex((block) => block.id === blockId)
  if (index < 0) commandError('NOT_FOUND', `Block 不存在：${blockId}`)
  return { page, block: page.blocks[index], index }
}

function duplicateTransform(transform: BlockTransform): BlockTransform {
  return {
    ...transform,
    x: Math.min(transform.x + 0.025, 1 - transform.width),
    y: Math.min(transform.y + 0.025, 1 - transform.height)
  }
}

function addImageBlocks(
  document: DocumentDraft,
  page: PageDraft,
  assetIds: readonly string[],
  idFactory: IdFactory
): void {
  if (page.blocks.length + assetIds.length > 100) {
    commandError('PAGE_LIMIT', '每页最多放置 100 个 Block')
  }
  for (const assetId of assetIds) requireAsset(document, assetId)

  const photos = assetIds.map((assetId) => {
    const asset = document.assets.find((candidate) => candidate.id === assetId)
    if (!asset) commandError('ASSET_MISSING', `素材不存在：${assetId}`)
    return { width: asset.width, height: asset.height }
  })
  const transforms = arrangeImageBlocksFree({
    photos,
    pageWidthMm: document.pageSpec.widthMm,
    pageHeightMm: document.pageSpec.heightMm
  })
  assetIds.forEach((assetId, index) => {
    const block = createImageBlock(assetId, undefined, idFactory)
    block.transform = { ...transforms[index] }
    page.blocks.push(block)
  })
  page.layoutId = null
}

function createBlock(input: AddBlockInput, idFactory: IdFactory): Block {
  switch (input.type) {
    case 'image':
      return createImageBlock(input.assetId, input.transform, idFactory)
    case 'rich-text':
      return createRichTextBlock(input.document, input.transform, idFactory)
    case 'decoration':
      return createDecorationBlock(input.decoration, input.transform, idFactory)
  }
}

function addBlock(
  document: DocumentDraft,
  page: PageDraft,
  input: AddBlockInput,
  idFactory: IdFactory
): void {
  if (page.blocks.length >= 100) commandError('PAGE_LIMIT', '每页最多放置 100 个 Block')
  let resolved: AddBlockInput = input
  if (input.type === 'image') {
    requireAsset(document, input.assetId)
    if (!input.transform) {
      const asset = document.assets.find((candidate) => candidate.id === input.assetId)
      if (!asset) commandError('ASSET_MISSING', `素材不存在：${input.assetId}`)
      const size = fitImageBlockSize({
        assetWidth: asset.width,
        assetHeight: asset.height,
        pageWidthMm: document.pageSpec.widthMm,
        pageHeightMm: document.pageSpec.heightMm
      })
      resolved = {
        ...input,
        transform: {
          ...DEFAULT_IMAGE_BLOCK_TRANSFORM,
          width: size.width,
          height: size.height
        }
      }
    }
  }
  page.blocks.push(createBlock(resolved, idFactory))
  if (resolved.type !== 'decoration') page.layoutId = null
}

function applyPageLayout(document: DocumentDraft, page: PageDraft, layoutId: PageLayoutId): void {
  if (layoutId === FREE_FORM_LAYOUT_ID) {
    const imageBlocks = page.blocks.filter(
      (block): block is Draft<ImageBlock> => block.type === 'image'
    )
    const photos = imageBlocks.map((block) => {
      const asset = document.assets.find((candidate) => candidate.id === block.assetId)
      if (!asset) commandError('ASSET_MISSING', `素材不存在：${block.assetId}`)
      return { width: asset.width, height: asset.height }
    })
    const transforms = arrangeImageBlocksFree({
      photos,
      pageWidthMm: document.pageSpec.widthMm,
      pageHeightMm: document.pageSpec.heightMm
    })
    imageBlocks.forEach((block, index) => {
      block.transform = { ...transforms[index] }
    })
    page.layoutId = FREE_FORM_LAYOUT_ID
    return
  }
  const layout = getPageLayout(layoutId)
  if (!layout.supportedPageKinds.includes(page.kind)) {
    commandError(
      'INVALID_TARGET',
      `布局“${layout.name}”不支持${page.kind === 'cover' ? '封面' : '内容页'}`
    )
  }

  const imageBlocks = page.blocks.filter((block) => block.type === 'image')
  const richTextBlocks = page.blocks.filter((block) => block.type === 'rich-text')
  const imageSlots = layout.slots.filter((slot) => slot.accepts === 'image')
  const richTextSlots = layout.slots.filter((slot) => slot.accepts === 'rich-text')
  if (imageBlocks.length !== imageSlots.length || richTextBlocks.length !== richTextSlots.length) {
    commandError(
      'LAYOUT_MISMATCH',
      `布局“${layout.name}”需要 ${imageSlots.length} 张图片和 ${richTextSlots.length} 个文字 Block`
    )
  }

  imageBlocks.forEach((block, index) => {
    block.transform = { ...imageSlots[index].transform }
  })
  richTextBlocks.forEach((block, index) => {
    block.transform = { ...richTextSlots[index].transform }
  })
  page.layoutId = layout.id
}

function applyCommand(document: DocumentDraft, command: AlbumCommand, idFactory: IdFactory): void {
  switch (command.type) {
    case 'register-assets': {
      const ids = new Set(document.assets.map((asset) => asset.id))
      const hashes = new Set(document.assets.map((asset) => asset.contentHash))
      for (const asset of command.assets) {
        if (ids.has(asset.id) || hashes.has(asset.contentHash)) {
          commandError('ASSET_CONFLICT', `素材 ID 或内容指纹重复：${asset.fileName}`)
        }
        ids.add(asset.id)
        hashes.add(asset.contentHash)
        document.assets.push(asset)
      }
      return
    }
    case 'add-page': {
      const page = createContentPage(idFactory)
      addImageBlocks(document, page, command.assetIds ?? [], idFactory)
      if (command.layoutId) applyPageLayout(document, page, command.layoutId)
      const afterIndex = command.afterPageId
        ? document.pages.findIndex((candidate) => candidate.id === command.afterPageId)
        : document.pages.length - 1
      if (afterIndex < 0) commandError('NOT_FOUND', `页面不存在：${command.afterPageId}`)
      document.pages.splice(afterIndex + 1, 0, page)
      return
    }
    case 'delete-page': {
      const index = document.pages.findIndex((page) => page.id === command.pageId)
      if (index < 0) commandError('NOT_FOUND', `页面不存在：${command.pageId}`)
      if (index === 0) commandError('INVALID_TARGET', '封面不能删除')
      document.pages.splice(index, 1)
      return
    }
    case 'reorder-page': {
      const index = document.pages.findIndex((page) => page.id === command.pageId)
      if (index < 0) commandError('NOT_FOUND', `页面不存在：${command.pageId}`)
      if (index === 0) commandError('INVALID_TARGET', '封面不能移动')
      if (command.toIndex >= document.pages.length) {
        commandError('INVALID_TARGET', '目标页面位置超出范围')
      }
      const [page] = document.pages.splice(index, 1)
      document.pages.splice(command.toIndex, 0, page)
      return
    }
    case 'place-assets': {
      const page = requirePage(document, command.pageId)
      addImageBlocks(document, page, command.assetIds, idFactory)
      if (command.layoutId) applyPageLayout(document, page, command.layoutId)
      return
    }
    case 'add-block': {
      addBlock(document, requirePage(document, command.pageId), command.block, idFactory)
      return
    }
    case 'set-block-transform': {
      const { page, block } = findBlock(document, command.pageId, command.blockId)
      block.transform = command.transform
      if (block.type !== 'decoration') page.layoutId = null
      return
    }
    case 'move-block-layer': {
      const { page, block, index } = findBlock(document, command.pageId, command.blockId)
      const targetIndex =
        command.direction === 'front'
          ? page.blocks.length - 1
          : command.direction === 'back'
            ? 0
            : command.direction === 'forward'
              ? Math.min(page.blocks.length - 1, index + 1)
              : Math.max(0, index - 1)
      if (targetIndex !== index) {
        page.blocks.splice(index, 1)
        page.blocks.splice(targetIndex, 0, block)
        if (block.type !== 'decoration') page.layoutId = null
      }
      return
    }
    case 'move-image-block-to-page': {
      if (command.sourcePageId === command.targetPageId) {
        commandError('INVALID_TARGET', '图片只能移动到另一页')
      }
      const {
        page: sourcePage,
        block,
        index
      } = findBlock(document, command.sourcePageId, command.blockId)
      if (block.type !== 'image') {
        commandError('INVALID_TARGET', '此命令只能用于 ImageBlock')
      }
      const targetPage = requirePage(document, command.targetPageId)
      if (targetPage.blocks.length >= 100) {
        commandError('PAGE_LIMIT', '每页最多放置 100 个 Block')
      }
      const [image] = sourcePage.blocks.splice(index, 1)
      targetPage.blocks.push(image)
      sourcePage.layoutId = null
      targetPage.layoutId = null
      return
    }
    case 'duplicate-block': {
      const { page, block, index } = findBlock(document, command.pageId, command.blockId)
      if (page.blocks.length >= 100) commandError('PAGE_LIMIT', '每页最多放置 100 个 Block')
      const duplicate = BlockSchema.parse(block)
      duplicate.id = idFactory()
      duplicate.transform = duplicateTransform(duplicate.transform)
      page.blocks.splice(index + 1, 0, duplicate)
      if (block.type !== 'decoration') page.layoutId = null
      return
    }
    case 'delete-block': {
      const { page, block, index } = findBlock(document, command.pageId, command.blockId)
      page.blocks.splice(index, 1)
      if (block.type !== 'decoration') page.layoutId = null
      return
    }
    case 'update-rich-text': {
      const { block } = findBlock(document, command.pageId, command.blockId)
      if (block.type !== 'rich-text') {
        commandError('INVALID_TARGET', '此命令只能用于 RichTextBlock')
      }
      block.document = command.document
      document.recentColors = mergeRecentColors(
        command.usedColors ?? collectRichTextColors(command.document),
        document.recentColors
      )
      return
    }
    case 'set-rich-text-writing-mode': {
      const { block } = findBlock(document, command.pageId, command.blockId)
      if (block.type !== 'rich-text') {
        commandError('INVALID_TARGET', '此命令只能用于 RichTextBlock')
      }
      block.writingMode = command.writingMode
      return
    }
    case 'update-image-edit': {
      const { page, block } = findBlock(document, command.pageId, command.blockId)
      if (block.type !== 'image') commandError('INVALID_TARGET', '此命令只能用于 ImageBlock')
      if (command.crop) {
        block.crop = command.crop
        const asset = document.assets.find((candidate) => candidate.id === block.assetId)
        if (asset) {
          const nextTransform = fitBlockTransformToCrop({
            transform: block.transform,
            pageWidthMm: document.pageSpec.widthMm,
            pageHeightMm: document.pageSpec.heightMm,
            assetWidth: asset.width,
            assetHeight: asset.height,
            rotationDeg: command.crop.rotationDeg,
            area: command.crop.area
          })
          if (!transformsEqual(block.transform, nextTransform)) {
            block.transform = nextTransform
            page.layoutId = null
          }
        }
      }
      if (command.effects) block.effects = command.effects
      if (command.mask) block.mask = command.mask
      if (command.caption) block.caption = command.caption
      return
    }
    case 'apply-effect-preset': {
      const { block } = findBlock(document, command.pageId, command.blockId)
      if (block.type !== 'image') commandError('INVALID_TARGET', '此命令只能用于 ImageBlock')
      block.effects = applyImageEffectPreset(command.presetId)
      return
    }
    case 'set-image-erase': {
      const { block } = findBlock(document, command.pageId, command.blockId)
      if (block.type !== 'image') commandError('INVALID_TARGET', '此命令只能用于 ImageBlock')
      block.erase = command.erase
      return
    }
    case 'clear-image-erase': {
      const { block } = findBlock(document, command.pageId, command.blockId)
      if (block.type !== 'image') commandError('INVALID_TARGET', '此命令只能用于 ImageBlock')
      delete block.erase
      return
    }
    case 'replace-decoration': {
      const { block } = findBlock(document, command.pageId, command.blockId)
      if (block.type !== 'decoration') {
        commandError('INVALID_TARGET', '此命令只能用于 DecorationBlock')
      }
      block.decoration = command.decoration
      return
    }
    case 'set-icon-color': {
      const { block } = findBlock(document, command.pageId, command.blockId)
      if (block.type !== 'decoration' || block.decoration.kind !== 'icon') {
        commandError('INVALID_TARGET', '此命令只能用于 Icon DecorationBlock')
      }
      block.decoration.color = command.color
      return
    }
    case 'apply-page-layout': {
      applyPageLayout(document, requirePage(document, command.pageId), command.layoutId)
      return
    }
    case 'set-theme':
      document.themeId = command.themeId
      return
    case 'set-project-title':
      document.title = command.title
      return
  }
}

function committedDocument(
  current: AlbumDocument,
  changed: AlbumDocument,
  now: string
): AlbumDocument {
  return AlbumDocumentSchema.parse({
    ...changed,
    schemaVersion: current.schemaVersion,
    id: current.id,
    createdAt: current.createdAt,
    revision: current.revision + 1,
    updatedAt: now
  })
}

export function executeAlbumCommand(
  documentInput: AlbumDocument,
  commandInput: AlbumCommand,
  options: AlbumCommandOptions = {}
): AlbumCommandResult {
  return executeAlbumCommands(documentInput, [commandInput], options)
}

export function executeAlbumCommands(
  documentInput: AlbumDocument,
  commandInputs: readonly AlbumCommand[],
  options: AlbumCommandOptions = {}
): AlbumCommandResult {
  const document = AlbumDocumentSchema.parse(documentInput)
  const commands = z.array(AlbumCommandSchema).min(1).parse(commandInputs)
  const idFactory = options.idFactory ?? (() => crypto.randomUUID())
  const [changed, patches, inversePatches] = produceWithPatches(document, (draft) => {
    for (const command of commands) applyCommand(draft, command, idFactory)
  })
  return {
    document: committedDocument(document, changed, options.now ?? new Date().toISOString()),
    patches,
    inversePatches
  }
}

export function applyAlbumPatches(
  documentInput: AlbumDocument,
  patches: readonly AlbumPatch[],
  options: Pick<AlbumCommandOptions, 'now'> = {}
): AlbumDocument {
  const document = AlbumDocumentSchema.parse(documentInput)
  const changed = applyPatches(document, patches)
  return committedDocument(document, changed, options.now ?? new Date().toISOString())
}
