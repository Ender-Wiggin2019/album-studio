import { useCallback } from 'react'
import {
  useProcessedImageSource,
  type ProcessedImageSourceState
} from '@/shared/image-processing/use-processed-image-source'
import { beautifyImageSource, type EnhanceParams } from './beautify-image-source'

const BEAUTY_DEBOUNCE_MS = 120

function isEnhanceActive(params: EnhanceParams): boolean {
  return params.beautySmooth > 0 || params.beautyWhiten > 0 || params.clarity > 0
}

function resultKey(params: EnhanceParams, maxEdge?: number, resourceKey?: string): string {
  return JSON.stringify([
    'beautify-v1',
    resourceKey ?? null,
    params.beautySmooth,
    params.beautyWhiten,
    params.clarity,
    maxEdge ?? 0
  ])
}

export function useBeautifiedSource(
  source: string | null,
  params: EnhanceParams,
  maxEdge?: number,
  resourceKey?: string
): ProcessedImageSourceState {
  const { beautySmooth, beautyWhiten, clarity } = params
  const process = useCallback(
    (input: string) => beautifyImageSource(input, { beautySmooth, beautyWhiten, clarity }, maxEdge),
    [beautySmooth, beautyWhiten, clarity, maxEdge]
  )

  return useProcessedImageSource({
    source,
    active: source !== null && isEnhanceActive(params),
    requestKey: source ? resultKey(params, maxEdge, resourceKey) : '',
    process,
    debounceMs: BEAUTY_DEBOUNCE_MS,
    taskClass: !maxEdge || maxEdge <= 0 ? 'full-resolution' : 'interactive'
  })
}
