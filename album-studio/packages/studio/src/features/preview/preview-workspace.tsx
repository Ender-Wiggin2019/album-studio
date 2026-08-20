import type { AlbumDocument } from '@album-studio/common'
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStudioStore } from '@/app/store'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AlbumPageView } from '@/features/canvas/album-page-view'
import { useMediaQuery } from '@/shared/dom/use-media-query'
import { fitAspectRatioWithin } from '@/shared/geometry/fit-aspect-ratio'
import { useElementContentSize } from '@/shared/geometry/use-element-content-size'
import { cn } from '@/shared/lib/cn'
import { buildPreviewPageGroups, findPreviewPageGroup, type PreviewMode } from './preview-model'
import './preview-workspace.css'

type TurnDirection = 'forward' | 'backward'

interface TurnState {
  direction: TurnDirection
  fromGroup: readonly number[]
  targetGroupIndex: number
  targetPageIndex: number
  toGroup: readonly number[]
}

const COVER_GROUP = [0] as const

function PreviewPage({
  document,
  pageIndex,
  className
}: {
  document: AlbumDocument
  pageIndex: number | null
  className?: string
}): React.JSX.Element {
  const page = pageIndex === null ? null : document.pages[pageIndex]
  return (
    <div
      className={cn('preview-book-page', className)}
      data-preview-page-index={pageIndex ?? undefined}
      data-preview-blank={page ? undefined : true}
    >
      {page ? (
        <AlbumPageView document={document} page={page} />
      ) : (
        <div className="preview-blank-page" aria-hidden="true" />
      )}
    </div>
  )
}

function doublePageSlots(group: readonly number[]): readonly [number | null, number | null] {
  return group[0] === 0 ? [null, 0] : [group[0] ?? null, group[1] ?? null]
}

function PreviewBook({
  document,
  mode,
  currentGroup,
  turn,
  width,
  height,
  onTurnEnd,
  onSwipe
}: {
  document: AlbumDocument
  mode: PreviewMode
  currentGroup: readonly number[]
  turn: TurnState | null
  width: number | null
  height: number | null
  onTurnEnd: () => void
  onSwipe: (direction: -1 | 1) => void
}): React.JSX.Element {
  const pointerStartX = useRef<number | null>(null)
  const visibleGroup = turn?.toGroup ?? currentGroup
  const closed = mode === 'double' && visibleGroup[0] === 0
  let basePages: readonly [number | null, number | null]
  let turnFront: number | null = null
  let turnBack: number | null = null

  if (mode === 'single') {
    const targetPage = turn?.toGroup[0] ?? currentGroup[0] ?? null
    basePages = [targetPage, null]
    turnFront = turn?.fromGroup[0] ?? null
    turnBack = targetPage
  } else if (turn) {
    const fromSlots = doublePageSlots(turn.fromGroup)
    const toSlots = doublePageSlots(turn.toGroup)
    if (turn.direction === 'forward') {
      basePages = [fromSlots[0], toSlots[1]]
      turnFront = fromSlots[1]
      turnBack = toSlots[0]
    } else {
      basePages = [toSlots[0], fromSlots[1]]
      turnFront = fromSlots[0]
      turnBack = toSlots[1]
    }
  } else {
    basePages = doublePageSlots(currentGroup)
  }

  const finishPointer = (clientX: number): void => {
    const startX = pointerStartX.current
    pointerStartX.current = null
    if (startX === null) return
    const distance = clientX - startX
    if (Math.abs(distance) >= 36) onSwipe(distance < 0 ? 1 : -1)
  }

  return (
    <div
      className="preview-book"
      data-testid="preview-book"
      data-preview-mode={mode}
      data-closed={closed || undefined}
      data-visible-page-ids={visibleGroup
        .map((pageIndex) => document.pages[pageIndex]?.id)
        .filter(Boolean)
        .join(' ')}
      style={{
        width: width ? `${width}px` : undefined,
        height: height ? `${height}px` : undefined,
        visibility: width && height ? undefined : 'hidden'
      }}
      onPointerDown={(event) => {
        if (!turn) pointerStartX.current = event.clientX
      }}
      onPointerUp={(event) => finishPointer(event.clientX)}
      onPointerCancel={() => {
        pointerStartX.current = null
      }}
    >
      <div className="preview-book-base" aria-hidden={turn ? 'true' : undefined}>
        <PreviewPage document={document} pageIndex={basePages[0]} className="is-left" />
        {mode === 'double' ? (
          <PreviewPage document={document} pageIndex={basePages[1]} className="is-right" />
        ) : null}
      </div>
      {turn ? (
        <div
          className="preview-turn-sheet"
          data-direction={turn.direction}
          data-layout={mode}
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) onTurnEnd()
          }}
          aria-hidden="true"
        >
          <PreviewPage document={document} pageIndex={turnFront} className="preview-turn-front" />
          <PreviewPage document={document} pageIndex={turnBack} className="preview-turn-back" />
        </div>
      ) : null}
    </div>
  )
}

function pageGroupLabel(group: readonly number[]): string {
  if (group[0] === 0) return '封面'
  if (group.length === 1) return `第 ${group[0]} 页`
  return `第 ${group[0]}–${group[1]} 页`
}

export function PreviewWorkspace(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectPage = useStudioStore((state) => state.selectPage)
  const setExclusiveWorkspace = useStudioStore((state) => state.setExclusiveWorkspace)
  const [mode, setMode] = useState<PreviewMode>('double')
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null)
  const [turn, setTurn] = useState<TurnState | null>(null)
  const currentThumbnailRef = useRef<HTMLButtonElement | null>(null)
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const availablePreviewSize = useElementContentSize(viewportElement)
  const initialPageIndex = document
    ? Math.max(
        0,
        document.pages.findIndex((page) => page.id === selectedPageId)
      )
    : 0
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPageIndex)
  const groups = useMemo(
    () => buildPreviewPageGroups(document?.pages.length ?? 0, mode),
    [document?.pages.length, mode]
  )
  const currentGroupIndex = findPreviewPageGroup(groups, currentPageIndex)
  const currentGroup = groups[currentGroupIndex] ?? COVER_GROUP

  useEffect(() => {
    currentThumbnailRef.current?.scrollIntoView?.({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'nearest'
    })
  }, [currentPageIndex, mode, reducedMotion])

  const commitPage = useCallback(
    (pageIndex: number): void => {
      const page = document?.pages[pageIndex]
      if (!page) return
      setCurrentPageIndex(pageIndex)
      selectPage(page.id)
    },
    [document?.pages, selectPage]
  )

  const requestGroup = useCallback(
    (targetGroupIndex: number, preferredPageIndex?: number): void => {
      if (turn || targetGroupIndex < 0 || targetGroupIndex >= groups.length) return
      const toGroup = groups[targetGroupIndex]
      if (!toGroup) return
      const targetPageIndex =
        preferredPageIndex !== undefined && toGroup.includes(preferredPageIndex)
          ? preferredPageIndex
          : (toGroup[0] ?? 0)
      if (targetGroupIndex === currentGroupIndex) {
        commitPage(targetPageIndex)
        return
      }
      if (reducedMotion) {
        commitPage(targetPageIndex)
        return
      }
      setTurn({
        direction: targetGroupIndex > currentGroupIndex ? 'forward' : 'backward',
        fromGroup: currentGroup,
        targetGroupIndex,
        targetPageIndex,
        toGroup
      })
    },
    [commitPage, currentGroup, currentGroupIndex, groups, reducedMotion, turn]
  )

  const move = useCallback(
    (direction: -1 | 1): void => requestGroup(currentGroupIndex + direction),
    [currentGroupIndex, requestGroup]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setExclusiveWorkspace(null)
        return
      }
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (
        event.target instanceof Element &&
        event.target.closest(
          '.preview-mode-toggle, input, select, textarea, [contenteditable="true"]'
        )
      ) {
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        move(event.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [move, setExclusiveWorkspace])

  if (!document) return <div />

  const pageAspectRatio = document.pageSpec.widthMm / document.pageSpec.heightMm
  const bookAspectRatio = pageAspectRatio * (mode === 'double' ? 2 : 1)
  const fittedBookSize = availablePreviewSize
    ? fitAspectRatioWithin({
        aspectRatio: bookAspectRatio,
        availableWidth: availablePreviewSize.width,
        availableHeight: availablePreviewSize.height
      })
    : null
  const portrait = pageAspectRatio < 1
  const visibleGroup = turn?.toGroup ?? currentGroup
  const visibleGroupIndex = turn?.targetGroupIndex ?? currentGroupIndex
  const headerLabel = pageGroupLabel(visibleGroup)
  const finishTurn = (): void => {
    if (!turn) return
    const targetPageIndex = turn.targetPageIndex
    setTurn(null)
    commitPage(targetPageIndex)
  }

  return (
    <section
      className="preview-workspace"
      aria-label="整册预览"
      data-page-orientation={portrait ? 'portrait' : 'landscape'}
      data-preview-mode={mode}
      data-preview-state={turn ? 'flipping' : 'idle'}
    >
      <header className="preview-toolbar">
        <span className="preview-page-counter">
          {headerLabel} · {visibleGroupIndex + 1} / {groups.length}
        </span>
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(value) => {
            if (value && !turn) setMode(value as PreviewMode)
          }}
          disabled={Boolean(turn)}
          aria-label="预览方式"
          className="preview-mode-toggle"
        >
          <ToggleGroupItem value="single">单页</ToggleGroupItem>
          <ToggleGroupItem value="double">双页</ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant="media"
          size="sm"
          className="preview-exit-button"
          onClick={() => setExclusiveWorkspace(null)}
        >
          <XIcon data-icon="inline-start" />
          退出预览
        </Button>
      </header>

      <div className="preview-body">
        <nav
          className="preview-page-strip"
          aria-label="预览页面"
          data-placement={portrait ? 'left' : 'bottom'}
        >
          {document.pages.map((candidate, candidateIndex) => {
            const visible = visibleGroup.includes(candidateIndex)
            return (
              <button
                key={candidate.id}
                ref={candidateIndex === currentPageIndex ? currentThumbnailRef : undefined}
                type="button"
                onClick={() =>
                  requestGroup(findPreviewPageGroup(groups, candidateIndex), candidateIndex)
                }
                className={cn(
                  'preview-thumbnail',
                  visible && 'is-visible',
                  candidateIndex === currentPageIndex && 'is-current'
                )}
                style={{ aspectRatio: pageAspectRatio }}
                aria-label={candidate.kind === 'cover' ? '封面' : `第 ${candidateIndex} 页`}
                aria-current={candidateIndex === currentPageIndex ? 'page' : undefined}
                disabled={Boolean(turn)}
              >
                <div className="pointer-events-none">
                  <AlbumPageView document={document} page={candidate} quality="thumbnail" />
                </div>
                <span className="preview-thumbnail-label" aria-hidden="true">
                  {candidate.kind === 'cover' ? '封面' : candidateIndex}
                </span>
              </button>
            )
          })}
        </nav>

        <div className="preview-stage" data-preview-stage>
          <div className="preview-nav-lane">
            <Button
              variant="media-outline"
              size="icon"
              onClick={() => move(-1)}
              disabled={Boolean(turn) || currentGroupIndex === 0}
              aria-label="上一页"
            >
              <ChevronLeftIcon />
            </Button>
          </div>
          <div ref={setViewportElement} className="preview-book-viewport">
            <PreviewBook
              document={document}
              mode={mode}
              currentGroup={currentGroup}
              turn={turn}
              width={fittedBookSize?.width ?? null}
              height={fittedBookSize?.height ?? null}
              onTurnEnd={finishTurn}
              onSwipe={move}
            />
          </div>
          <div className="preview-nav-lane">
            <Button
              variant="media-outline"
              size="icon"
              onClick={() => move(1)}
              disabled={Boolean(turn) || currentGroupIndex >= groups.length - 1}
              aria-label="下一页"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {headerLabel}
      </span>
    </section>
  )
}
