import {
  ICON_RESOURCE_IDS,
  STICKER_RESOURCE_IDS,
  type IconResourceId,
  type StickerResourceId
} from '@album-studio/common'

export const BLOCK_PLACEMENT_SOURCE_TYPE = 'album-block-source' as const
export const ALBUM_PAGE_DROP_TARGET_TYPE = 'album-page' as const

export type BlockPlacementPayload =
  | Readonly<{ kind: 'asset'; assetId: string }>
  | Readonly<{ kind: 'rich-text' }>
  | Readonly<{ kind: 'icon'; resourceId: IconResourceId }>
  | Readonly<{ kind: 'sticker'; resourceId: StickerResourceId }>

export type AlbumPageDropPayload = Readonly<{
  kind: 'album-page'
  pageId: string
}>

export type BlockPlacementDndData = BlockPlacementPayload | AlbumPageDropPayload

const ICON_RESOURCE_ID_SET = new Set<string>(ICON_RESOURCE_IDS)
const STICKER_RESOURCE_ID_SET = new Set<string>(STICKER_RESOURCE_IDS)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && actual.every((key) => keys.includes(key))
}

export function isBlockPlacementPayload(value: unknown): value is BlockPlacementPayload {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  switch (value.kind) {
    case 'asset':
      return (
        hasOnlyKeys(value, ['kind', 'assetId']) &&
        typeof value.assetId === 'string' &&
        value.assetId.length > 0
      )
    case 'rich-text':
      return hasOnlyKeys(value, ['kind'])
    case 'icon':
      return (
        hasOnlyKeys(value, ['kind', 'resourceId']) &&
        typeof value.resourceId === 'string' &&
        ICON_RESOURCE_ID_SET.has(value.resourceId)
      )
    case 'sticker':
      return (
        hasOnlyKeys(value, ['kind', 'resourceId']) &&
        typeof value.resourceId === 'string' &&
        STICKER_RESOURCE_ID_SET.has(value.resourceId)
      )
    default:
      return false
  }
}

export function isAlbumPageDropPayload(value: unknown): value is AlbumPageDropPayload {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['kind', 'pageId']) &&
    value.kind === 'album-page' &&
    typeof value.pageId === 'string' &&
    value.pageId.length > 0
  )
}

export function blockPlacementSourceId(payload: BlockPlacementPayload): string {
  switch (payload.kind) {
    case 'asset':
      return `block-source:asset:${payload.assetId}`
    case 'rich-text':
      return 'block-source:rich-text'
    case 'icon':
      return `block-source:icon:${payload.resourceId}`
    case 'sticker':
      return `block-source:sticker:${payload.resourceId}`
  }
}
