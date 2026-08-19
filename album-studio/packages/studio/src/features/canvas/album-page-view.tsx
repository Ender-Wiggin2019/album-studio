import type { AlbumDocument, AlbumPage, RichTextDocument } from '@album-studio/common'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssetQuality } from '@/app/platform/studio-platform'
import { BlockView } from './block-view'

type PrintImageState = 'pending' | 'ready' | 'fallback'

export type PrintBookReadyResult = Readonly<{
  totalImages: number
  fallbackCount: number
}>

export function AlbumPageView({
  document,
  page,
  selectedBlockId,
  interactive = false,
  showSafeArea = false,
  quality = 'preview',
  richTextDraft,
  onSelectBlock,
  onSourceError,
  onPrintImageStateChange
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
  onPrintImageStateChange?: (imageId: string, state: PrintImageState) => void
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
              onPrintReadinessChange={
                block.type === 'image'
                  ? (state) => onPrintImageStateChange?.(`${page.id}:${block.id}`, state)
                  : undefined
              }
            />
          )
        })}
        {showSafeArea ? <div className="album-safe-area" aria-hidden="true" /> : null}
      </div>
    </div>
  )
}

export function PrintBook({
  document,
  onReady
}: {
  document: AlbumDocument
  onReady?: (result: PrintBookReadyResult) => void
}): React.JSX.Element {
  const pageWidth = `${document.pageSpec.widthMm}mm`
  const pageHeight = `${document.pageSpec.heightMm}mm`
  const imageIds = document.pages.flatMap((page) =>
    page.blocks.flatMap((block) => (block.type === 'image' ? [`${page.id}:${block.id}`] : []))
  )
  const statesRef = useRef<Map<string, PrintImageState>>(
    new Map(imageIds.map((imageId) => [imageId, 'pending']))
  )
  const readyReportedRef = useRef(false)
  const [stateVersion, setStateVersion] = useState(0)

  const reportImageState = useCallback((imageId: string, state: PrintImageState) => {
    if (!statesRef.current.has(imageId) || statesRef.current.get(imageId) === state) return
    statesRef.current.set(imageId, state)
    setStateVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (readyReportedRef.current) return
    const states = [...statesRef.current.values()]
    if (states.some((state) => state === 'pending')) return
    readyReportedRef.current = true
    onReady?.({
      totalImages: states.length,
      fallbackCount: states.filter((state) => state === 'fallback').length
    })
  }, [onReady, stateVersion])

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
          <AlbumPageView
            document={document}
            page={page}
            quality="print"
            onPrintImageStateChange={reportImageState}
          />
        </div>
      ))}
    </div>
  )
}
