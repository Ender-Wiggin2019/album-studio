import { Maximize2Icon, MinusIcon, PanelRightIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet'
import { useStudioStore } from '@/app/store'
import { AlbumPageView } from './album-page-view'
import { ContextInspector } from './context-inspector'
import { PageRail } from './page-rail'

export function EditorWorkspace(): React.JSX.Element {
  const project = useStudioStore((state) => state.project)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedSlotId = useStudioStore((state) => state.selectedSlotId)
  const selectPage = useStudioStore((state) => state.selectPage)
  const selectSlot = useStudioStore((state) => state.selectSlot)
  const setMode = useStudioStore((state) => state.setMode)
  const [zoom, setZoom] = useState(0.9)
  const page =
    project?.pages.find((candidate) => candidate.id === selectedPageId) ?? project?.pages[0]
  if (!project || !page) return <div />
  const fit = (): void => setZoom(0.9)
  return (
    <div className="editor-layout min-h-0 flex-1">
      <PageRail />
      <section className="canvas-workspace" aria-label="相册画布">
        <div className="canvas-toolbar">
          <span className="text-xs text-muted-foreground">A4 横向 · 装订安全区</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((value) => Math.max(0.45, value - 0.1))}
              aria-label="缩小"
            >
              <MinusIcon />
            </Button>
            <button
              type="button"
              onClick={fit}
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
            <Button variant="ghost" size="icon-sm" onClick={fit} aria-label="适合窗口">
              <Maximize2Icon />
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button className="mobile-inspector-trigger" variant="outline" size="sm">
                  <PanelRightIcon data-icon="inline-start" />
                  属性
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>页面属性</SheetTitle>
                  <SheetDescription>编辑当前页面或选中照片。</SheetDescription>
                </SheetHeader>
                <SheetBody className="p-0">
                  <ContextInspector embedded />
                </SheetBody>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        <div className="canvas-scroll" onClick={() => selectPage(page.id)}>
          <div className="canvas-sheet" style={{ width: `${zoom * 94}%` }}>
            <AlbumPageView
              project={project}
              page={page}
              interactive
              selectedSlotId={selectedSlotId}
              showSafeArea
              onSelectSlot={(slotId) => selectSlot(page.id, slotId)}
            />
          </div>
          {page.kind === 'content' && page.slots.every((slot) => !slot.assetId) ? (
            <div className="canvas-empty-action">
              <p className="text-sm font-medium">这一页还没有照片</p>
              <Button
                className="mt-3"
                size="sm"
                onClick={(event) => {
                  event.stopPropagation()
                  setMode('library')
                }}
              >
                从素材库添加
              </Button>
            </div>
          ) : null}
        </div>
      </section>
      <ContextInspector />
    </div>
  )
}
