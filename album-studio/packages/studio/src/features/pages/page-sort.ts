import type { AlbumCommand } from '@album-studio/common'

export const PAGE_SORT_TYPE = 'album-page-sort' as const

export type PageSortData = Readonly<{
  kind: 'page-sort'
  pageId: string
}>

function isPageSortData(value: unknown): value is PageSortData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    Object.keys(record).length === 2 &&
    record.kind === 'page-sort' &&
    typeof record.pageId === 'string' &&
    record.pageId.length > 0
  )
}

export function buildPageReorderCommand(input: {
  canceled: boolean
  sourceData: unknown
  sourceType: unknown
  initialIndex: number
  currentIndex: number
  pageCount: number
  /** dnd-kit optimistic sorting mutates DOM order before React state is committed. */
  optimisticPageIds?: readonly string[]
}): AlbumCommand | null {
  const sourceData = isPageSortData(input.sourceData) ? input.sourceData : null
  const optimisticIndex = sourceData
    ? (input.optimisticPageIds?.indexOf(sourceData.pageId) ?? -1)
    : -1
  // React can render between optimistic DOM reordering and dragend, resetting
  // source.index to its controlled prop. Prefer a visibly changed DOM index;
  // otherwise retain dnd-kit's current index for non-optimistic configurations.
  const currentIndex =
    optimisticIndex >= 0 && optimisticIndex !== input.initialIndex
      ? optimisticIndex
      : input.currentIndex
  if (
    input.canceled ||
    input.sourceType !== PAGE_SORT_TYPE ||
    !sourceData ||
    currentIndex === input.initialIndex ||
    currentIndex < 1 ||
    currentIndex >= input.pageCount
  ) {
    return null
  }

  return {
    type: 'reorder-page',
    pageId: sourceData.pageId,
    toIndex: currentIndex
  }
}
