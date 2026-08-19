import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useStudioStore } from '@/app/store'
import { AlbumPageView } from '@/features/canvas/album-page-view'
import { fitAspectRatioWithin } from '@/shared/geometry/fit-aspect-ratio'
import { useElementContentSize } from '@/shared/geometry/use-element-content-size'

export function PreviewWorkspace(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectPage = useStudioStore((state) => state.selectPage)
  const setExclusiveWorkspace = useStudioStore((state) => state.setExclusiveWorkspace)
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null)
  const availablePreviewSize = useElementContentSize(viewportElement)
  if (!document) return <div />
  const index = Math.max(
    0,
    document.pages.findIndex((page) => page.id === selectedPageId)
  )
  const page = document.pages[index]
  const fittedPageSize = availablePreviewSize
    ? fitAspectRatioWithin({
        aspectRatio: document.pageSpec.widthMm / document.pageSpec.heightMm,
        availableWidth: availablePreviewSize.width,
        availableHeight: availablePreviewSize.height,
        maxWidth: 1_100
      })
    : null
  const move = (direction: -1 | 1): void => {
    const target = document.pages[index + direction]
    if (target) {
      selectPage(target.id)
      setExclusiveWorkspace('preview')
    }
  }
  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-media-stage text-media-stage-foreground"
      aria-label="整册预览"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-media-stage-border px-5">
        <span className="font-mono text-xs text-media-stage-muted">
          {index + 1} / {document.pages.length} ·{' '}
          {page.kind === 'cover' ? '封面' : `第 ${index} 页`}
        </span>
        <Button variant="media" size="sm" onClick={() => setExclusiveWorkspace(null)}>
          <XIcon data-icon="inline-start" />
          退出预览
        </Button>
      </div>
      <div
        ref={setViewportElement}
        className="relative grid min-h-0 flex-1 place-items-center overflow-hidden p-8"
      >
        <Button
          variant="media-outline"
          size="icon"
          className="absolute left-5 z-10"
          onClick={() => move(-1)}
          disabled={index === 0}
          aria-label="上一页"
        >
          <ChevronLeftIcon />
        </Button>
        <div
          className="preview-page-frame"
          style={{
            width: fittedPageSize ? `${fittedPageSize.width}px` : 'min(1100px, 84vw)',
            visibility: fittedPageSize ? undefined : 'hidden'
          }}
        >
          <AlbumPageView document={document} page={page} />
        </div>
        <Button
          variant="media-outline"
          size="icon"
          className="absolute right-5 z-10"
          onClick={() => move(1)}
          disabled={index >= document.pages.length - 1}
          aria-label="下一页"
        >
          <ChevronRightIcon />
        </Button>
      </div>
      <div className="flex h-24 shrink-0 items-center gap-2 overflow-x-auto border-t border-media-stage-border px-5 py-2">
        {document.pages.map((candidate, candidateIndex) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => {
              selectPage(candidate.id)
              setExclusiveWorkspace('preview')
            }}
            className={`h-20 shrink-0 overflow-hidden rounded-sm border-2 ${candidate.id === page.id ? 'border-media-stage-foreground' : 'border-transparent opacity-60 hover:opacity-100'}`}
            style={{ aspectRatio: document.pageSpec.widthMm / document.pageSpec.heightMm }}
            aria-label={candidate.kind === 'cover' ? '封面' : `第 ${candidateIndex} 页`}
          >
            <div className="pointer-events-none">
              <AlbumPageView document={document} page={candidate} quality="thumbnail" />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
