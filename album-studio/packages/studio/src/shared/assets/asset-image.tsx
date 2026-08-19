import { useEffect, useRef, type ImgHTMLAttributes } from 'react'
import type { ImageEffects } from '@album-studio/common'
import { useAssetSource } from './use-asset-source'
import { useBeautifiedSource } from '@/shared/beauty/use-beautified-source'
import type { AssetSourceRequest } from '@/app/platform/studio-platform'

type AssetImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  documentId: string
  assetId: string
  sourceRequest: AssetSourceRequest
  onSourceError?: () => void
  /** 像素增强参数；全 0 或缺省时直接渲染原资源（零开销）。 */
  beautify?: Pick<ImageEffects, 'beautySmooth' | 'beautyWhiten' | 'clarity'>
  /** 美颜处理前的最长边上限；缺省 2048。 */
  beautyMaxEdge?: number
}

export function AssetImage({
  documentId,
  assetId,
  sourceRequest,
  onSourceError,
  beautify,
  beautyMaxEdge,
  onError,
  ...props
}: AssetImageProps): React.JSX.Element | null {
  const { source, failed } = useAssetSource(documentId, assetId, sourceRequest)
  const { source: beautifiedSource } = useBeautifiedSource(
    source,
    beautify ?? { beautySmooth: 0, beautyWhiten: 0, clarity: 0 },
    beautyMaxEdge
  )
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
      src={beautifiedSource ?? source}
      onError={(event) => {
        onSourceError?.()
        onError?.(event)
      }}
    />
  )
}
