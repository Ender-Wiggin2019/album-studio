import type { AlbumDocument, AlbumPage, RichTextDocument } from '@album-studio/common'
import type { AssetQuality } from '@/app/platform/studio-platform'
import { BlockView } from './block-view'

export function AlbumPageView({
  document,
  page,
  selectedBlockId,
  interactive = false,
  showSafeArea = false,
  quality = 'preview',
  richTextDraft,
  onSelectBlock,
  onSourceError
}: {
  document: AlbumDocument
  page: AlbumPage
  selectedBlockId?: string | null
  interactive?: boolean
  showSafeArea?: boolean
  quality?: AssetQuality
  richTextDraft?: Readonly<{
    pageId: string
    blockId: string
    document: RichTextDocument
  }> | null
  onSelectBlock?: (blockId: string) => void
  onSourceError?: (blockId: string) => void
}): React.JSX.Element {
  return (
    <div className="album-document" data-album-theme={document.themeId}>
      <div
        className="album-page"
        data-page-kind={page.kind}
        data-page-id={page.id}
        style={{ aspectRatio: `${document.pageSpec.widthMm} / ${document.pageSpec.heightMm}` }}
      >
        {page.blocks.map((block) => {
          const renderedBlock =
            block.type === 'rich-text' &&
            richTextDraft?.pageId === page.id &&
            richTextDraft.blockId === block.id
              ? { ...block, document: richTextDraft.document }
              : block
          return (
            <BlockView
              key={block.id}
              document={document}
              block={renderedBlock}
              quality={quality}
              selected={selectedBlockId === block.id}
              interactive={interactive}
              onSelect={() => onSelectBlock?.(block.id)}
              onSourceError={() => onSourceError?.(block.id)}
            />
          )
        })}
        {showSafeArea ? <div className="album-safe-area" aria-hidden="true" /> : null}
      </div>
    </div>
  )
}

export function PrintBook({ document }: { document: AlbumDocument }): React.JSX.Element {
  const pageWidth = `${document.pageSpec.widthMm}mm`
  const pageHeight = `${document.pageSpec.heightMm}mm`
  return (
    <div
      className="print-book"
      data-print-book
      style={
        {
          '--print-page-width': pageWidth,
          '--print-page-height': pageHeight
        } as React.CSSProperties
      }
    >
      <style
        data-page-spec-print-style
      >{`@page { size: ${pageWidth} ${pageHeight}; margin: 0; }`}</style>
      {document.pages.map((page) => (
        <div className="print-page" key={page.id}>
          <AlbumPageView document={document} page={page} quality="print" />
        </div>
      ))}
    </div>
  )
}
