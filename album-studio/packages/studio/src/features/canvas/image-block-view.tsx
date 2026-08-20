import {
  computeCropStyle,
  computeImageEffectStyle,
  eraseKeyFor,
  type AlbumDocument,
  type ImageBlock,
  type TextStyle
} from '@album-studio/common'
import { ImageOffIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetQuality } from '@/app/platform/studio-platform'
import { AssetImage, type AssetImageReadiness } from '@/shared/assets/asset-image'
import { useElementSize } from '@/shared/dom/use-element-size'
import { richTextFontFamilyToCss } from '@/features/text-edit/rich-text-fonts'
import { richTextFontSizeToCqw } from '@/features/text-edit/rich-text-metrics'

function captionStyle(style: TextStyle, pageWidthMm: number): React.CSSProperties {
  return {
    color: style.color,
    fontFamily: richTextFontFamilyToCss(style.fontFamily),
    fontSize: `${richTextFontSizeToCqw(style.fontSize, pageWidthMm)}cqw`,
    fontWeight: style.weight,
    lineHeight: style.lineHeight,
    textAlign: style.align
  }
}

export function ImageBlockView({
  document,
  block,
  quality = 'preview',
  onSourceError,
  onPrintReadinessChange
}: {
  document: AlbumDocument
  block: ImageBlock
  quality?: AssetQuality
  onSourceError?: () => void
  onPrintReadinessChange?: (state: 'pending' | 'ready' | 'fallback') => void
}): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const viewportSize = useElementSize(viewportRef)
  const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null)
  const [sourceFailed, setSourceFailed] = useState(false)
  const asset = document.assets.find((candidate) => candidate.id === block.assetId)
  const effectStyle = computeImageEffectStyle(block.effects)
  const cropStyle =
    sourceSize && viewportSize ? computeCropStyle(block.crop, sourceSize, viewportSize) : undefined

  const eraseKey = block.erase ? eraseKeyFor(block.erase) : null
  const [erasedUnavailable, setErasedUnavailable] = useState(false)
  const [lastEraseKey, setLastEraseKey] = useState(eraseKey)
  // 渲染期调整：erase 参数变化时重新尝试 erased 变体（避免 effect 内 setState）
  if (lastEraseKey !== eraseKey) {
    setLastEraseKey(eraseKey)
    setErasedUnavailable(false)
  }
  const usesErased = block.erase !== undefined && !erasedUnavailable

  useEffect(() => {
    if (quality !== 'print' || asset) return
    onPrintReadinessChange?.('fallback')
  }, [asset, onPrintReadinessChange, quality])

  const handleReadinessChange = useCallback(
    (readiness: AssetImageReadiness): void => {
      if (readiness.status === 'pending') {
        onPrintReadinessChange?.('pending')
        return
      }
      if (readiness.status === 'ready') {
        onPrintReadinessChange?.(readiness.fallback ? 'fallback' : 'ready')
        return
      }
      // An erased cache miss remounts the same Block with its base print source.
      onPrintReadinessChange?.(usesErased ? 'pending' : 'fallback')
    },
    [onPrintReadinessChange, usesErased]
  )

  const sourceRequest =
    usesErased && block.erase
      ? {
          quality: 'erased' as const,
          eraseKey: eraseKeyFor(block.erase),
          pageWidthRatio: block.transform.width,
          pageHeightRatio: block.transform.height
        }
      : {
          quality,
          pageWidthRatio: block.transform.width,
          pageHeightRatio: block.transform.height,
          crop: quality === 'print' ? block.crop : undefined
        }

  return (
    <div className="album-image-block-content">
      <div ref={viewportRef} className="album-image-viewport" data-mask={block.mask.kind}>
        {asset ? (
          <AssetImage
            documentId={document.id}
            assetId={asset.id}
            sourceRequest={sourceRequest}
            beautify={block.effects}
            beautyMaxEdge={quality === 'print' ? 0 : 2048}
            onReadinessChange={quality === 'print' ? handleReadinessChange : undefined}
            alt={block.caption.text || asset.fileName}
            draggable={false}
            decoding="async"
            loading={quality === 'print' ? 'eager' : 'lazy'}
            style={
              cropStyle
                ? { ...cropStyle, filter: effectStyle.filter }
                : {
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: effectStyle.filter
                  }
            }
            onLoad={(event) => {
              const image = event.currentTarget
              setSourceFailed(false)
              setSourceSize({ width: image.naturalWidth, height: image.naturalHeight })
            }}
            onSourceError={() => {
              // 消除结果缓存缺失时回退到原图，而不是当作图片丢失
              if (usesErased) {
                setErasedUnavailable(true)
                return
              }
              setSourceFailed(true)
              onSourceError?.()
            }}
          />
        ) : null}
        {!asset || sourceFailed ? (
          <span className="album-image-missing">
            <ImageOffIcon />
            {asset ? '图片文件不可用' : '找不到图片记录'}
          </span>
        ) : null}
        {block.effects.vignette > 0 ? (
          <span
            className="album-image-vignette"
            style={{ background: effectStyle.vignetteBackground }}
            aria-hidden="true"
          />
        ) : null}
        {block.caption.enabled &&
        block.caption.text &&
        block.caption.placement === 'inside-bottom' ? (
          <span
            className="album-image-caption"
            data-placement="inside-bottom"
            style={captionStyle(block.caption.style, document.pageSpec.widthMm)}
          >
            {block.caption.text}
          </span>
        ) : null}
      </div>
      {block.caption.enabled && block.caption.text && block.caption.placement === 'below' ? (
        <span
          className="album-image-caption"
          data-placement="below"
          style={captionStyle(block.caption.style, document.pageSpec.widthMm)}
        >
          {block.caption.text}
        </span>
      ) : null}
    </div>
  )
}
