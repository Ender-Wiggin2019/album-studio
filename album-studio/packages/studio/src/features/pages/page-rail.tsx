import type { AlbumDocument, AlbumPage } from '@album-studio/common'
import { useDragDropMonitor } from '@dnd-kit/react'
import { isSortableOperation, useSortable } from '@dnd-kit/react/sortable'
import { GripVerticalIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/shared/lib/cn'
import { useStudioStore } from '@/app/store'
import { AlbumPageView } from '@/features/canvas/album-page-view'
import { buildPageReorderCommand, PAGE_SORT_TYPE, type PageSortData } from './page-sort'

function SortablePageItem({
  document,
  page,
  index,
  selected,
  richTextDraft,
  onSelect,
  onDelete
}: PageRailItemProps): React.JSX.Element {
  const { ref, handleRef, isDragging, isDropTarget } = useSortable<PageSortData>({
    id: `page-sort:${page.id}`,
    index,
    group: document.id,
    type: PAGE_SORT_TYPE,
    accept: PAGE_SORT_TYPE,
    data: { kind: 'page-sort', pageId: page.id }
  })

  return (
    <PageRailItem
      document={document}
      page={page}
      index={index}
      selected={selected}
      richTextDraft={richTextDraft}
      onSelect={onSelect}
      onDelete={onDelete}
      containerRef={ref}
      handleRef={handleRef}
      isDragging={isDragging}
      isDropTarget={isDropTarget}
    />
  )
}

interface PageRailItemProps {
  document: AlbumDocument
  page: AlbumPage
  index: number
  selected: boolean
  richTextDraft: ReturnType<typeof useStudioStore.getState>['richTextDraft']
  onSelect: () => void
  onDelete: () => void
  containerRef?: (element: Element | null) => void
  handleRef?: (element: Element | null) => void
  isDragging?: boolean
  isDropTarget?: boolean
}

function PageRailItem({
  document,
  page,
  index,
  selected,
  richTextDraft,
  onSelect,
  onDelete,
  containerRef,
  handleRef,
  isDragging = false,
  isDropTarget = false
}: PageRailItemProps): React.JSX.Element {
  return (
    <div
      ref={containerRef}
      className="page-rail-item group"
      data-page-id={page.id}
      data-dragging={isDragging || undefined}
      data-drop-target={isDropTarget || undefined}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'page-thumbnail outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'page-thumbnail-selected'
        )}
        aria-current={selected ? 'page' : undefined}
      >
        <div className="pointer-events-none">
          <AlbumPageView
            document={document}
            page={page}
            quality="thumbnail"
            richTextDraft={richTextDraft}
          />
        </div>
      </button>
      <div className="flex min-w-0 items-center gap-1">
        {page.kind === 'content' ? (
          <Button
            ref={handleRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            data-dnd-handle
            aria-label={`拖拽排序第 ${index} 页`}
          >
            <GripVerticalIcon />
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 cursor-pointer truncate text-left text-xs font-medium hover:text-primary"
        >
          {page.kind === 'cover' ? '封面' : `第 ${index} 页 · ${page.blocks.length} 个 Block`}
        </button>
        {page.kind === 'content' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="删除页面"
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function PageRail(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const richTextDraft = useStudioStore((state) => state.richTextDraft)
  const selectPage = useStudioStore((state) => state.selectPage)
  const dispatch = useStudioStore((state) => state.dispatch)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  useDragDropMonitor<PageSortData>({
    onDragEnd: (event) => {
      if (!document || !isSortableOperation(event.operation)) return
      const source = event.operation.source
      const optimisticPageIds = source?.element?.parentElement
        ? Array.from(source.element.parentElement.children)
            .filter((element) => !(element as HTMLElement).hasAttribute('data-dnd-placeholder'))
            .map((element) => (element as HTMLElement).dataset.pageId)
            .filter((pageId): pageId is string => Boolean(pageId))
        : undefined
      const command = buildPageReorderCommand({
        canceled: event.canceled,
        sourceData: source?.data,
        sourceType: source?.type,
        initialIndex: source?.initialIndex ?? -1,
        currentIndex: source?.index ?? -1,
        pageCount: document.pages.length,
        optimisticPageIds
      })
      if (command) dispatch(command)
    }
  })

  if (!document) return <aside />
  const addBlankPage = (afterPageId: string | undefined): void => {
    dispatch({ type: 'add-page', afterPageId })
    const pages = useStudioStore.getState().document?.pages
    if (!pages) return
    const anchorIndex = afterPageId
      ? pages.findIndex((page) => page.id === afterPageId)
      : pages.length - 1
    const pageId = pages[anchorIndex + 1]?.id ?? pages.at(-1)?.id
    if (pageId) selectPage(pageId)
  }
  return (
    <aside className="page-rail border-r bg-muted/35" aria-label="相册页面">
      <div className="page-rail-heading">
        <span>页面</span>
        <span>{document.pages.length}</span>
      </div>
      <div className="page-rail-list">
        {document.pages.map((page, index) => {
          const item = {
            document,
            page,
            index,
            selected: selectedPageId === page.id,
            richTextDraft,
            onSelect: () => selectPage(page.id),
            onDelete: () => setPendingDelete(page.id)
          }
          return page.kind === 'cover' ? (
            <PageRailItem key={page.id} {...item} />
          ) : (
            <SortablePageItem key={page.id} {...item} />
          )
        })}
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => addBlankPage(document.pages.at(-1)?.id)}
        >
          <PlusIcon data-icon="inline-start" />
          添加页面
        </Button>
      </div>
      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这一页？</AlertDialogTitle>
            <AlertDialogDescription>
              页面排版会被删除，但照片仍保留在素材库中。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) dispatch({ type: 'delete-page', pageId: pendingDelete })
                setPendingDelete(null)
              }}
            >
              删除页面
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  )
}
