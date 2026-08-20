import type { BlockTransform } from '@album-studio/common'
import { Maximize2Icon, MinusIcon, PanelRightIcon, PlusIcon } from 'lucide-react'
import Moveable from 'react-moveable'
import { useCallback, useRef, useState } from 'react'
import { useStudioStore } from '@/app/store'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet'
import { useAlbumPageDropTarget } from '@/features/block-placement/use-album-page-drop-target'
import { RightPanel } from '@/features/inspector/right-panel'
import { PageRail } from '@/features/pages/page-rail'
import { useMediaQuery } from '@/shared/dom/use-media-query'
import { fitAspectRatioWithin } from '@/shared/geometry/fit-aspect-ratio'
import { useElementContentSize } from '@/shared/geometry/use-element-content-size'
import { AlbumPageView } from './album-page-view'

const PAGE_SPEC_NAMES = {
  'a4-landscape': 'A4 横向',
  'a4-portrait': 'A4 竖排',
  'square-12': '12 寸方形',
  'widescreen-16-9': '16:9 宽屏'
} as const

function clampedTransform(transform: BlockTransform): BlockTransform {
  const width = Math.min(1, Math.max(0.04, transform.width))
  const height = Math.min(1, Math.max(0.04, transform.height))
  return {
    ...transform,
    width,
    height,
    x: Math.min(1 - width, Math.max(0, transform.x)),
    y: Math.min(1 - height, Math.max(0, transform.y)),
    rotationDeg: ((((transform.rotationDeg + 180) % 360) + 360) % 360) - 180
  }
}

function pageRailHitAtPoint(
  ownerDocument: Document,
  clientX: number,
  clientY: number
): { pageId: string | null } | null {
  const element = ownerDocument.elementFromPoint(clientX, clientY)
  if (!element?.closest('.page-rail')) return null
  return {
    pageId: element.closest<HTMLElement>('.page-rail-item[data-page-id]')?.dataset.pageId ?? null
  }
}

export function EditorWorkspace(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedBlockId = useStudioStore((state) => state.selectedBlockId)
  const selectPage = useStudioStore((state) => state.selectPage)
  const selectBlock = useStudioStore((state) => state.selectBlock)
  const clearBlockSelection = useStudioStore((state) => state.clearBlockSelection)
  const setRightPanelTab = useStudioStore((state) => state.setRightPanelTab)
  const rightPanelSheetOpen = useStudioStore((state) => state.rightPanelSheetOpen)
  const setRightPanelSheetOpen = useStudioStore((state) => state.setRightPanelSheetOpen)
  const richTextDraft = useStudioStore((state) => state.richTextDraft)
  const dispatch = useStudioStore((state) => state.dispatch)
  const markAssetMissing = useStudioStore((state) => state.markAssetMissing)
  const sheetRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<BlockTransform | null>(null)
  const [zoom, setZoom] = useState(1)
  const [blockDropTargetPageId, setBlockDropTargetPageId] = useState<string | null>(null)
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  const availableCanvasSize = useElementContentSize(scrollElement)
  const page =
    document?.pages.find((candidate) => candidate.id === selectedPageId) ?? document?.pages[0]
  const { ref: dropTargetRef, isDropTarget } = useAlbumPageDropTarget(page?.id ?? 'inactive-page')
  const widePanel = useMediaQuery('(min-width: 1280px)', true)
  const block = selectedBlockId
    ? page?.blocks.find((candidate) => candidate.id === selectedBlockId)
    : undefined
  const fittedPageSize =
    document && availableCanvasSize
      ? fitAspectRatioWithin({
          aspectRatio: document.pageSpec.widthMm / document.pageSpec.heightMm,
          availableWidth: availableCanvasSize.width,
          availableHeight: availableCanvasSize.height,
          maxWidth: 1_100
        })
      : null

  const setCanvasSheetRef = useCallback(
    (element: HTMLDivElement | null): void => {
      sheetRef.current = element
      dropTargetRef(element)
    },
    [dropTargetRef]
  )

  if (!document || !page) return <div />

  const targetSelector = block ? `.canvas-sheet [data-block-id="${CSS.escape(block.id)}"]` : null
  const blockGuidelines = page.blocks
    .filter((candidate) => candidate.id !== block?.id)
    .map((candidate) => `.canvas-sheet [data-block-id="${CSS.escape(candidate.id)}"]`)

  const pageSize = (): { width: number; height: number } | null => {
    const bounds = sheetRef.current?.getBoundingClientRect()
    return bounds && bounds.width > 0 && bounds.height > 0
      ? { width: bounds.width, height: bounds.height }
      : null
  }

  const fitToWindow = (): void => {
    setZoom(1)
  }

  const previewTransform = (target: HTMLElement | SVGElement, next: BlockTransform): void => {
    target.style.left = `${next.x * 100}%`
    target.style.top = `${next.y * 100}%`
    target.style.width = `${next.width * 100}%`
    target.style.height = `${next.height * 100}%`
    target.style.transform = `rotate(${next.rotationDeg}deg)`
    gestureRef.current = next
  }

  const commitGesture = (): void => {
    const next = gestureRef.current
    gestureRef.current = null
    if (!next || !block) return
    dispatch({
      type: 'set-block-transform',
      pageId: page.id,
      blockId: block.id,
      transform: clampedTransform(next)
    })
  }

  const validImageMoveTarget = (pageId: string | null): string | null => {
    if (!pageId || pageId === page.id) return null
    const targetPage = document.pages.find((candidate) => candidate.id === pageId)
    return targetPage && targetPage.blocks.length < 100 ? targetPage.id : null
  }

  return (
    <div className="editor-layout min-h-0 flex-1">
      <PageRail blockDropTargetPageId={blockDropTargetPageId} />
      <section className="canvas-workspace" aria-label="相册画布">
        <div className="canvas-toolbar">
          <span className="text-xs text-muted-foreground">
            {PAGE_SPEC_NAMES[document.pageSpec.presetId]} · {document.pageSpec.widthMm} ×{' '}
            {document.pageSpec.heightMm} mm · 拖动 Block，自由缩放与旋转
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((value) => Math.max(0.42, value - 0.1))}
              aria-label="缩小"
            >
              <MinusIcon />
            </Button>
            <button
              type="button"
              onClick={fitToWindow}
              className="min-w-14 rounded px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
              aria-label="放大"
            >
              <PlusIcon />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={fitToWindow} aria-label="适合窗口">
              <Maximize2Icon />
            </Button>
            {!widePanel ? (
              <Button
                className="mobile-inspector-trigger"
                variant="outline"
                size="sm"
                onClick={() => setRightPanelSheetOpen(true)}
              >
                <PanelRightIcon data-icon="inline-start" />
                装帧托盘
              </Button>
            ) : null}
            {!widePanel ? (
              <Sheet open={rightPanelSheetOpen} onOpenChange={setRightPanelSheetOpen}>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>装帧托盘</SheetTitle>
                    <SheetDescription>页面布局、项目素材、组件和当前 Block 编辑。</SheetDescription>
                  </SheetHeader>
                  <SheetBody className="overflow-hidden p-0">
                    <RightPanel embedded />
                  </SheetBody>
                </SheetContent>
              </Sheet>
            ) : null}
          </div>
        </div>
        <div
          ref={setScrollElement}
          className="canvas-scroll"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) clearBlockSelection()
          }}
        >
          <div
            ref={setCanvasSheetRef}
            className="canvas-sheet"
            data-drop-target={isDropTarget || undefined}
            style={{
              width: fittedPageSize ? `${fittedPageSize.width * zoom}px` : 'min(94%, 1100px)',
              visibility: fittedPageSize ? undefined : 'hidden'
            }}
            onPointerDown={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('.moveable-control-box')
              ) {
                return
              }
              selectPage(page.id)
            }}
          >
            <AlbumPageView
              document={document}
              page={page}
              interactive
              selectedBlockId={selectedBlockId}
              richTextDraft={richTextDraft}
              showSafeArea
              onSelectBlock={(blockId) => {
                if (selectedBlockId !== blockId) selectBlock(page.id, blockId)
              }}
              onSourceError={(blockId) => {
                const failedBlock = page.blocks.find((candidate) => candidate.id === blockId)
                if (failedBlock?.type === 'image') markAssetMissing(failedBlock.assetId)
              }}
            />
            {targetSelector && block ? (
              <Moveable
                target={targetSelector}
                draggable
                resizable
                keepRatio={block.type !== 'rich-text'}
                rotatable
                useResizeObserver
                snappable
                origin={false}
                renderDirections={['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']}
                snapContainer={sheetRef}
                elementGuidelines={blockGuidelines}
                verticalGuidelines={['5%', '50%', '95%']}
                horizontalGuidelines={['7%', '50%', '93%']}
                snapGap
                snapThreshold={6}
                snapRotationDegrees={[0, 15, 30, 45, 90, 135, 180, -15, -30, -45, -90, -135]}
                snapRotationThreshold={5}
                bounds={{ left: 0, top: 0, right: 0, bottom: 0, position: 'css' }}
                onDragStart={(event) => {
                  event.set([0, 0])
                  gestureRef.current = { ...block.transform }
                  setBlockDropTargetPageId(null)
                }}
                onDrag={(event) => {
                  const size = pageSize()
                  if (!size) return
                  if (block.type === 'image') {
                    const hit = pageRailHitAtPoint(
                      event.target.ownerDocument,
                      event.clientX,
                      event.clientY
                    )
                    const targetPageId = validImageMoveTarget(hit?.pageId ?? null)
                    setBlockDropTargetPageId((current) =>
                      current === targetPageId ? current : targetPageId
                    )
                  }
                  previewTransform(
                    event.target,
                    clampedTransform({
                      ...block.transform,
                      x: block.transform.x + event.beforeTranslate[0] / size.width,
                      y: block.transform.y + event.beforeTranslate[1] / size.height
                    })
                  )
                }}
                onDragEnd={(event) => {
                  const hit =
                    block.type === 'image'
                      ? pageRailHitAtPoint(event.target.ownerDocument, event.clientX, event.clientY)
                      : null
                  const targetPageId = validImageMoveTarget(hit?.pageId ?? null)
                  setBlockDropTargetPageId(null)
                  if (block.type === 'image' && hit) {
                    previewTransform(event.target, block.transform)
                    gestureRef.current = null
                    if (event.isDrag && targetPageId) {
                      dispatch({
                        type: 'move-image-block-to-page',
                        sourcePageId: page.id,
                        targetPageId,
                        blockId: block.id
                      })
                    }
                    return
                  }
                  commitGesture()
                }}
                onResizeStart={(event) => {
                  const resizeTarget = event.target as HTMLElement
                  event.set([resizeTarget.offsetWidth, resizeTarget.offsetHeight])
                  if (event.dragStart) event.dragStart.set([0, 0])
                  gestureRef.current = { ...block.transform }
                }}
                onResize={(event) => {
                  const size = pageSize()
                  if (!size) return
                  previewTransform(
                    event.target,
                    clampedTransform({
                      ...block.transform,
                      x: block.transform.x + event.drag.beforeTranslate[0] / size.width,
                      y: block.transform.y + event.drag.beforeTranslate[1] / size.height,
                      width: event.width / size.width,
                      height: event.height / size.height
                    })
                  )
                }}
                onResizeEnd={commitGesture}
                onRotateStart={(event) => {
                  event.set(block.transform.rotationDeg)
                  gestureRef.current = { ...block.transform }
                }}
                onRotate={(event) =>
                  previewTransform(
                    event.target,
                    clampedTransform({
                      ...block.transform,
                      rotationDeg: event.rotation
                    })
                  )
                }
                onRotateEnd={commitGesture}
              />
            ) : null}
          </div>
          {page.blocks.length === 0 ? (
            <div className="canvas-empty-action">
              <p className="text-sm font-medium">这一页还没有内容</p>
              <Button
                className="mt-3"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation()
                  setRightPanelTab('assets')
                  setRightPanelSheetOpen(true)
                }}
              >
                打开素材库
              </Button>
            </div>
          ) : null}
        </div>
      </section>
      {widePanel ? <RightPanel /> : null}
    </div>
  )
}
