import { useCallback, useEffect, useRef, type ImgHTMLAttributes } from 'react'
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
  /** 像素处理前的最长边上限；缺省 0 表示保留源图尺寸。 */
  beautyMaxEdge?: number
  onReadinessChange?: (readiness: AssetImageReadiness) => void
}

export type AssetImageReadiness =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'ready'; fallback: boolean }>
  | Readonly<{ status: 'failed' }>

function processingResourceKey(
  documentId: string,
  assetId: string,
  request: AssetSourceRequest
): string {
  return JSON.stringify([
    documentId,
    assetId,
    request.quality,
    request.quality === 'print' ? (request.pageWidthRatio ?? null) : null,
    request.quality === 'print' ? (request.pageHeightRatio ?? null) : null,
    request.quality === 'erased' ? (request.eraseKey ?? null) : null
  ])
}

export function AssetImage({
  documentId,
  assetId,
  sourceRequest,
  onSourceError,
  beautify,
  beautyMaxEdge,
  onReadinessChange,
  onLoad,
  onError,
  ...props
}: AssetImageProps): React.JSX.Element | null {
  const { source, failed } = useAssetSource(documentId, assetId, sourceRequest)
  const beautified = useBeautifiedSource(
    source,
    beautify ?? { beautySmooth: 0, beautyWhiten: 0, clarity: 0 },
    beautyMaxEdge,
    processingResourceKey(documentId, assetId, sourceRequest)
  )
  const onSourceErrorRef = useRef(onSourceError)
  const onReadinessChangeRef = useRef(onReadinessChange)
  const imageRef = useRef<HTMLImageElement>(null)
  const loadedSourceRef = useRef<string | null>(null)
  const readinessVersionRef = useRef(0)
  const lastReadinessRef = useRef('')
  const renderedSource = beautified.source ?? source

  const reportReadiness = useCallback((readiness: AssetImageReadiness): void => {
    const key =
      readiness.status === 'ready' ? `${readiness.status}:${readiness.fallback}` : readiness.status
    if (lastReadinessRef.current === key) return
    lastReadinessRef.current = key
    onReadinessChangeRef.current?.(readiness)
  }, [])

  const settleLoadedImage = useCallback(
    (image: HTMLImageElement): void => {
      const version = readinessVersionRef.current
      const finish = (decodeFailed: boolean): void => {
        if (version !== readinessVersionRef.current) return
        reportReadiness({ status: 'ready', fallback: beautified.failed || decodeFailed })
      }

      if (typeof image.decode !== 'function') {
        finish(false)
        return
      }
      try {
        void image.decode().then(
          () => finish(false),
          () => finish(true)
        )
      } catch {
        finish(true)
      }
    },
    [beautified.failed, reportReadiness]
  )

  useEffect(() => {
    onSourceErrorRef.current = onSourceError
  }, [onSourceError])

  useEffect(() => {
    onReadinessChangeRef.current = onReadinessChange
  }, [onReadinessChange])

  useEffect(() => {
    if (!failed) return
    reportReadiness({ status: 'failed' })
    onSourceErrorRef.current?.()
  }, [failed, reportReadiness])

  useEffect(() => {
    readinessVersionRef.current += 1
    if (failed) return
    if (!source || !renderedSource || beautified.pending) {
      reportReadiness({ status: 'pending' })
      return
    }

    reportReadiness({ status: 'pending' })
    if (imageRef.current && loadedSourceRef.current === renderedSource) {
      settleLoadedImage(imageRef.current)
    }
  }, [
    beautified.failed,
    beautified.pending,
    failed,
    renderedSource,
    reportReadiness,
    settleLoadedImage,
    source
  ])

  if (failed) return null
  if (!source) return null
  const displaySource = renderedSource ?? source

  return (
    <img
      {...props}
      ref={imageRef}
      src={displaySource}
      onLoad={(event) => {
        const loadedSource =
          event.currentTarget.currentSrc || event.currentTarget.getAttribute('src') || displaySource
        loadedSourceRef.current = loadedSource
        onLoad?.(event)
        if (!beautified.pending && loadedSource === displaySource) {
          settleLoadedImage(event.currentTarget)
        }
      }}
      onError={(event) => {
        loadedSourceRef.current = null
        reportReadiness({ status: 'failed' })
        onSourceError?.()
        onError?.(event)
      }}
    />
  )
}
