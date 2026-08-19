import { useCallback } from 'react'
import {
  useProcessedImageSource,
  type ProcessedImageSourceState
} from '@/shared/image-processing/use-processed-image-source'
import {
  editImageSource,
  editSourceResultKey,
  isEditSourceActive,
  type EditSourceParams
} from './edit-image-source'

const EDIT_DEBOUNCE_MS = 120

export function useEditSource(
  source: string | null,
  params: EditSourceParams,
  maxEdge?: number
): ProcessedImageSourceState {
  const { beautySmooth, beautyWhiten, clarity, flipX, flipY, rotationDeg } = params
  const process = useCallback(
    (input: string) =>
      editImageSource(
        input,
        { beautySmooth, beautyWhiten, clarity, flipX, flipY, rotationDeg },
        maxEdge
      ),
    [beautySmooth, beautyWhiten, clarity, flipX, flipY, maxEdge, rotationDeg]
  )

  return useProcessedImageSource({
    source,
    active: source !== null && isEditSourceActive(params),
    requestKey: source ? `edit-v1|${editSourceResultKey(source, params)}|${maxEdge ?? 0}` : '',
    process,
    debounceMs: EDIT_DEBOUNCE_MS
  })
}
