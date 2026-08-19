import {
  DEFAULT_DECORATION_BLOCK_TRANSFORM,
  DEFAULT_IMAGE_BLOCK_TRANSFORM,
  DEFAULT_RICH_TEXT_BLOCK_TRANSFORM,
  createRichTextDocument,
  fitImageBlockSize,
  type AlbumCommand,
  type BlockTransform,
  type Decoration,
  type PageSpec
} from '@album-studio/common'
import {
  isAlbumPageDropPayload,
  isBlockPlacementPayload,
  type BlockPlacementPayload
} from './payload'

export type PlacementPoint = Readonly<{ x: number; y: number }>
export type PageDropRect = Readonly<{
  left: number
  top: number
  width: number
  height: number
}>
export type AssetPixelSize = Readonly<{ width: number; height: number }>
export type PlacementOptions = Readonly<{
  point?: PlacementPoint
  assetSize?: AssetPixelSize
  pageSpec?: PageSpec
}>

export const DEFAULT_ICON_COLOR = '#a84835' as const
export const DEFAULT_RICH_TEXT_CONTENT = '在这里写下故事' as const

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name}必须是有限数字。`)
  return value
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function defaultSize(payload: BlockPlacementPayload): Readonly<{ width: number; height: number }> {
  switch (payload.kind) {
    case 'asset':
      return { width: DEFAULT_IMAGE_BLOCK_TRANSFORM.width, height: DEFAULT_IMAGE_BLOCK_TRANSFORM.height }
    case 'rich-text':
      return {
        width: DEFAULT_RICH_TEXT_BLOCK_TRANSFORM.width,
        height: DEFAULT_RICH_TEXT_BLOCK_TRANSFORM.height
      }
    case 'icon':
    case 'sticker':
      return {
        width: DEFAULT_DECORATION_BLOCK_TRANSFORM.width,
        height: DEFAULT_DECORATION_BLOCK_TRANSFORM.height
      }
  }
}

export function clientPointToNormalizedPagePoint(
  point: PlacementPoint,
  pageRect: PageDropRect
): PlacementPoint {
  const width = finite(pageRect.width, '页面宽度')
  const height = finite(pageRect.height, '页面高度')
  if (width <= 0 || height <= 0) throw new Error('页面尺寸必须大于 0。')
  return {
    x: (finite(point.x, '横坐标') - finite(pageRect.left, '页面左边界')) / width,
    y: (finite(point.y, '纵坐标') - finite(pageRect.top, '页面上边界')) / height
  }
}

export function transformCenteredAt(
  payload: BlockPlacementPayload,
  point: PlacementPoint,
  options: PlacementOptions = {}
): BlockTransform {
  const size =
    payload.kind === 'asset' && options.assetSize && options.pageSpec
      ? fitImageBlockSize({
          assetWidth: options.assetSize.width,
          assetHeight: options.assetSize.height,
          pageWidthMm: options.pageSpec.widthMm,
          pageHeightMm: options.pageSpec.heightMm
        })
      : defaultSize(payload)
  const centerX = finite(point.x, '页面横坐标')
  const centerY = finite(point.y, '页面纵坐标')
  return {
    x: clamp(centerX - size.width / 2, 0, 1 - size.width),
    y: clamp(centerY - size.height / 2, 0, 1 - size.height),
    width: size.width,
    height: size.height,
    rotationDeg: 0
  }
}

export function decorationFromPlacementPayload(
  payload: Extract<BlockPlacementPayload, { kind: 'icon' | 'sticker' }>,
  iconColor: string = DEFAULT_ICON_COLOR
): Decoration {
  return payload.kind === 'icon'
    ? { kind: 'icon', resourceId: payload.resourceId, color: iconColor }
    : { kind: 'sticker', resourceId: payload.resourceId }
}

export function buildAddBlockCommand(
  pageId: string,
  payload: BlockPlacementPayload,
  options: PlacementOptions = {}
): AlbumCommand {
  const transform = transformCenteredAt(payload, options.point ?? { x: 0.5, y: 0.5 }, options)
  switch (payload.kind) {
    case 'asset':
      return {
        type: 'add-block',
        pageId,
        block: { type: 'image', assetId: payload.assetId, transform }
      }
    case 'rich-text':
      return {
        type: 'add-block',
        pageId,
        block: {
          type: 'rich-text',
          document: createRichTextDocument(DEFAULT_RICH_TEXT_CONTENT),
          transform
        }
      }
    case 'icon':
    case 'sticker':
      return {
        type: 'add-block',
        pageId,
        block: {
          type: 'decoration',
          decoration: decorationFromPlacementPayload(payload),
          transform
        }
      }
  }
}

export function buildDroppedBlockCommand(input: {
  canceled: boolean
  sourceData: unknown
  targetData: unknown
  targetRect: PageDropRect | null
  clientPoint: PlacementPoint
  assetSize?: AssetPixelSize
  pageSpec?: PageSpec
}): AlbumCommand | null {
  if (
    input.canceled ||
    !input.targetRect ||
    !isBlockPlacementPayload(input.sourceData) ||
    !isAlbumPageDropPayload(input.targetData)
  ) {
    return null
  }
  const point = clientPointToNormalizedPagePoint(input.clientPoint, input.targetRect)
  return buildAddBlockCommand(input.targetData.pageId, input.sourceData, {
    point,
    assetSize: input.assetSize,
    pageSpec: input.pageSpec
  })
}
