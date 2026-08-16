import { useDroppable } from '@dnd-kit/react'
import {
  ALBUM_PAGE_DROP_TARGET_TYPE,
  BLOCK_PLACEMENT_SOURCE_TYPE,
  type AlbumPageDropPayload,
  type BlockPlacementDndData
} from './payload'

export function useAlbumPageDropTarget(pageId: string): {
  ref: (element: Element | null) => void
  isDropTarget: boolean
} {
  const data: AlbumPageDropPayload = { kind: 'album-page', pageId }
  const { ref, isDropTarget } = useDroppable<BlockPlacementDndData>({
    id: `album-page:${pageId}`,
    type: ALBUM_PAGE_DROP_TARGET_TYPE,
    accept: BLOCK_PLACEMENT_SOURCE_TYPE,
    data
  })
  return { ref, isDropTarget }
}
