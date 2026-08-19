import type { AlbumDocument, Block } from '@album-studio/common'
import type { AssetQuality } from '@/app/platform/studio-platform'
import { DecorationBlockView } from './decoration-block-view'
import { ImageBlockView } from './image-block-view'
import { RichTextBlockView } from '@/features/text-edit/rich-text-block-view'

function selectionLabel(document: AlbumDocument, block: Block): string {
  if (block.type === 'image') {
    const asset = document.assets.find((candidate) => candidate.id === block.assetId)
    return asset ? `选择照片 ${asset.fileName}` : '选择不可用的图片'
  }
  if (block.type === 'rich-text') return '选择文字'
  return block.decoration.kind === 'icon' ? '选择图标' : '选择贴纸'
}

export function BlockView({
  document,
  block,
  quality = 'preview',
  selected = false,
  interactive = false,
  onSelect,
  onSourceError,
  onPrintReadinessChange
}: {
  document: AlbumDocument
  block: Block
  quality?: AssetQuality
  selected?: boolean
  interactive?: boolean
  onSelect?: () => void
  onSourceError?: () => void
  onPrintReadinessChange?: (state: 'pending' | 'ready' | 'fallback') => void
}): React.JSX.Element {
  return (
    <div
      className="album-block"
      data-block-id={block.id}
      data-block-type={block.type}
      data-selected={selected || undefined}
      style={{
        left: `${block.transform.x * 100}%`,
        top: `${block.transform.y * 100}%`,
        width: `${block.transform.width * 100}%`,
        height: `${block.transform.height * 100}%`,
        transform: `rotate(${block.transform.rotationDeg}deg)`
      }}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? selectionLabel(document, block) : undefined}
      onPointerDown={(event) => {
        if (!interactive) return
        event.stopPropagation()
        onSelect?.()
      }}
      onKeyDown={(event) => {
        if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        onSelect?.()
      }}
    >
      {block.type === 'image' ? (
        <ImageBlockView
          document={document}
          block={block}
          quality={quality}
          onSourceError={onSourceError}
          onPrintReadinessChange={onPrintReadinessChange}
        />
      ) : block.type === 'rich-text' ? (
        <RichTextBlockView document={block.document} />
      ) : (
        <DecorationBlockView block={block} />
      )}
    </div>
  )
}
