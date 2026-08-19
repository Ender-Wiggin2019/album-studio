import { ChevronDownIcon, ChevronUpIcon, PlusIcon, Trash2Icon } from 'lucide-react'
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

export function PageRail(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const richTextDraft = useStudioStore((state) => state.richTextDraft)
  const selectPage = useStudioStore((state) => state.selectPage)
  const dispatch = useStudioStore((state) => state.dispatch)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

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
    <aside
      className="page-rail border-r bg-muted/35"
      aria-label="相册页面"
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        const target = event.target as HTMLElement | null
        if (!target?.closest('.page-thumbnail')) return
        event.preventDefault()
        addBlankPage(selectedPageId ?? document.pages[0]?.id)
      }}
    >
      <div className="page-rail-heading">
        <span>页面</span>
        <span>{document.pages.length}</span>
      </div>
      <div className="page-rail-list">
        {document.pages.map((page, index) => (
          <div key={page.id} className="page-rail-item group">
            <button
              type="button"
              onClick={() => selectPage(page.id)}
              className={cn(
                'page-thumbnail outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selectedPageId === page.id && 'page-thumbnail-selected'
              )}
              aria-current={selectedPageId === page.id ? 'page' : undefined}
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
            <div className="flex min-w-0 items-center justify-between gap-1">
              <button
                type="button"
                onClick={() => selectPage(page.id)}
                className="min-w-0 flex-1 truncate text-left text-xs font-medium"
              >
                {page.kind === 'cover' ? '封面' : `第 ${index} 页 · ${page.blocks.length} 个 Block`}
              </button>
              {page.kind === 'content' ? (
                <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    onClick={() =>
                      dispatch({ type: 'reorder-page', pageId: page.id, toIndex: index - 1 })
                    }
                    disabled={index <= 1}
                    aria-label="向前移动页面"
                  >
                    <ChevronUpIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                    onClick={() =>
                      dispatch({ type: 'reorder-page', pageId: page.id, toIndex: index + 1 })
                    }
                    disabled={index >= document.pages.length - 1}
                    aria-label="向后移动页面"
                  >
                    <ChevronDownIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setPendingDelete(page.id)}
                    aria-label="删除页面"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
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
              className="bg-destructive hover:bg-destructive/90"
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
