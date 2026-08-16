import { useDraggable } from '@dnd-kit/react'
import {
  BLOCK_PLACEMENT_SOURCE_TYPE,
  blockPlacementSourceId,
  type BlockPlacementDndData,
  type BlockPlacementPayload
} from './payload'

export function useDraggableBlockSource(
  payload: BlockPlacementPayload,
  options: { disabled?: boolean } = {}
): {
  ref: (element: Element | null) => void
  isDragging: boolean
} {
  const { ref, isDragging } = useDraggable<BlockPlacementDndData>({
    id: blockPlacementSourceId(payload),
    type: BLOCK_PLACEMENT_SOURCE_TYPE,
    data: payload,
    disabled: options.disabled
  })
  return { ref, isDragging }
}
