import { useEffect, useState } from 'react'
import { useStudioPlatform } from '@/app/platform/use-studio-platform'
import type { AssetSourceRequest } from '@/app/platform/studio-platform'

type AssetSourceState = {
  source: string | null
  failed: boolean
}

type InternalAssetSourceState = AssetSourceState & {
  requestKey: string
}

const INITIAL_STATE: AssetSourceState = { source: null, failed: false }

export function useAssetSource(
  documentId: string,
  assetId: string | null,
  request: AssetSourceRequest
): AssetSourceState {
  const platform = useStudioPlatform()
  const [state, setState] = useState<InternalAssetSourceState>({
    ...INITIAL_STATE,
    requestKey: ''
  })
  const { quality, pageWidthRatio, pageHeightRatio, crop, eraseKey } = request
  const cropKey = crop
    ? JSON.stringify([
        crop.area.x,
        crop.area.y,
        crop.area.width,
        crop.area.height,
        crop.rotationDeg,
        crop.flipX,
        crop.flipY
      ])
    : ''
  const requestKey = assetId
    ? `${documentId}:${assetId}:${quality}:${pageWidthRatio ?? ''}:${pageHeightRatio ?? ''}:${cropKey}:${eraseKey ?? ''}`
    : ''

  useEffect(() => {
    if (!assetId) return

    let active = true
    let source: string | null = null

    void platform.assets
      .getSource(documentId, assetId, {
        quality,
        pageWidthRatio,
        pageHeightRatio,
        crop,
        eraseKey
      })
      .then((nextSource) => {
        source = nextSource
        if (active) setState({ source: nextSource, failed: false, requestKey })
        else platform.assets.releaseSource(nextSource)
      })
      .catch(() => {
        if (active) setState({ source: null, failed: true, requestKey })
      })

    return () => {
      active = false
      if (source) platform.assets.releaseSource(source)
    }
  }, [
    assetId,
    crop,
    cropKey,
    documentId,
    eraseKey,
    pageHeightRatio,
    pageWidthRatio,
    platform,
    quality,
    requestKey
  ])

  return state.requestKey === requestKey ? state : INITIAL_STATE
}
