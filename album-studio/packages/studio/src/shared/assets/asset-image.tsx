import { useEffect, useRef, type ImgHTMLAttributes } from 'react'
import { useAssetSource } from './use-asset-source'
import type { AssetSourceRequest } from '@/app/platform/studio-platform'

type AssetImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  documentId: string
  assetId: string
  sourceRequest: AssetSourceRequest
  onSourceError?: () => void
}

export function AssetImage({
  documentId,
  assetId,
  sourceRequest,
  onSourceError,
  onError,
  ...props
}: AssetImageProps): React.JSX.Element | null {
  const { source, failed } = useAssetSource(documentId, assetId, sourceRequest)
  const onSourceErrorRef = useRef(onSourceError)

  useEffect(() => {
    onSourceErrorRef.current = onSourceError
  }, [onSourceError])

  useEffect(() => {
    if (failed) onSourceErrorRef.current?.()
  }, [failed])

  if (failed) return null
  if (!source) return null

  return (
    <img
      {...props}
      src={source}
      onError={(event) => {
        onSourceError?.()
        onError?.(event)
      }}
    />
  )
}
