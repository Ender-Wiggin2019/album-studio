import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  FileDownIcon,
  Redo2Icon,
  Undo2Icon
} from 'lucide-react'
import type { AlbumDocument } from '@album-studio/common'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useStudioPlatform } from '@/app/platform/use-studio-platform'
import { useStudioStore } from '@/app/store'
import { waitForAssetImports } from '@/app/pending-asset-imports'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BlockPlacementDragDropProvider } from '@/features/block-placement/drag-drop-provider'
import { PrintBook, type PrintBookReadyResult } from '@/features/canvas/album-page-view'
import { PreviewWorkspace } from '@/features/preview/preview-workspace'
import { BRAND_NAME, BrandMark } from '@/shared/brand/brand-mark'
import { shouldIgnoreStudioShortcut } from './studio-keyboard'
import { waitForPrintReadiness } from './print-readiness'

const EditorWorkspace = lazy(async () => ({
  default: (await import('@/features/canvas/editor-workspace')).EditorWorkspace
}))
const PhotoEditWorkspace = lazy(async () => ({
  default: (await import('@/features/image-edit/photo-edit-workspace')).PhotoEditWorkspace
}))
const ErasePeopleWorkspace = lazy(async () => ({
  default: (await import('@/features/image-edit/erase-people-workspace')).ErasePeopleWorkspace
}))

function WorkspaceLoading(): React.JSX.Element {
  return (
    <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground">
      正在打开工作区…
    </div>
  )
}

function SaveIndicator(): React.JSX.Element {
  const saveState = useStudioStore((state) => state.saveState)
  const saveError = useStudioStore((state) => state.saveError)
  const retrySave = useStudioStore((state) => state.retrySave)
  if (saveState === 'saving' || saveState === 'dirty') {
    return <span className="save-indicator text-muted-foreground">正在保存…</span>
  }
  if (saveState === 'error') {
    return (
      <button
        type="button"
        className="save-indicator text-destructive"
        onClick={retrySave}
        title={saveError ?? undefined}
      >
        <AlertCircleIcon className="size-3.5" />
        保存失败 · 重试
      </button>
    )
  }
  return (
    <span className="save-indicator text-muted-foreground">
      <CheckIcon className="size-3.5" />
      已保存
    </span>
  )
}

export function StudioWorkspace(): React.JSX.Element {
  const platform = useStudioPlatform()
  const document = useStudioStore((state) => state.document)
  const exclusiveWorkspace = useStudioStore((state) => state.exclusiveWorkspace)
  const setExclusiveWorkspace = useStudioStore((state) => state.setExclusiveWorkspace)
  const flush = useStudioStore((state) => state.flush)
  const closeDocument = useStudioStore((state) => state.closeDocument)
  const undo = useStudioStore((state) => state.undo)
  const redo = useStudioStore((state) => state.redo)
  const canUndo = useStudioStore((state) => state.history.past.length > 0)
  const canRedo = useStudioStore((state) => state.history.future.length > 0)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportMessage, setExportMessage] = useState('准备页面资源…')
  const [printDocument, setPrintDocument] = useState<AlbumDocument | null>(null)
  const printReadyRef = useRef<((result: PrintBookReadyResult) => void) | null>(null)
  const [returning, setReturning] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useStudioStore.getState()
      if (
        shouldIgnoreStudioShortcut({
          defaultPrevented: event.defaultPrevented,
          isComposing: event.isComposing,
          target: event.target,
          exclusiveWorkspace: state.exclusiveWorkspace
        })
      ) {
        return
      }
      const commandKey = event.metaKey || event.ctrlKey
      if (commandKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }

      const { document: currentDocument, selectedPageId, selectedBlockId } = state
      if (!currentDocument || !selectedPageId || !selectedBlockId) return
      const page = currentDocument.pages.find((candidate) => candidate.id === selectedPageId)
      if (!page) return
      const block = page.blocks.find((candidate) => candidate.id === selectedBlockId)
      if (!block) return

      if (commandKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        state.dispatch({ type: 'duplicate-block', pageId: page.id, blockId: block.id })
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        state.dispatch({ type: 'delete-block', pageId: page.id, blockId: block.id })
        return
      }
      if (commandKey && (event.code === 'BracketRight' || event.code === 'BracketLeft')) {
        event.preventDefault()
        state.dispatch({
          type: 'move-block-layer',
          pageId: page.id,
          blockId: block.id,
          direction:
            event.code === 'BracketRight'
              ? event.shiftKey
                ? 'front'
                : 'forward'
              : event.shiftKey
                ? 'back'
                : 'backward'
        })
        return
      }
      const direction = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1]
      }[event.key]
      if (!direction) return
      event.preventDefault()
      const step = event.shiftKey ? 0.01 : 0.002
      state.dispatch({
        type: 'set-block-transform',
        pageId: page.id,
        blockId: block.id,
        transform: {
          ...block.transform,
          x: Math.max(
            0,
            Math.min(1 - block.transform.width, block.transform.x + direction[0] * step)
          ),
          y: Math.max(
            0,
            Math.min(1 - block.transform.height, block.transform.y + direction[1] * step)
          )
        }
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!document) return <div />

  const returnHome = async (): Promise<void> => {
    if (returning) return
    setReturning(true)
    try {
      await waitForAssetImports()
      await flush()
      closeDocument()
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败'
      toast.error(`无法返回项目首页：${message}`)
    } finally {
      setReturning(false)
    }
  }

  const exportPdf = async (): Promise<void> => {
    setExportOpen(true)
    setExporting(true)
    setExportProgress(20)
    setExportMessage('正在保存最新修改…')
    try {
      await flush()
      setExportProgress(55)
      setExportMessage('正在等待图片并生成页面…')
      const current = useStudioStore.getState().document
      if (!current) return
      const readiness = new Promise<PrintBookReadyResult>((resolve) => {
        printReadyRef.current = resolve
      })
      setPrintDocument(current)
      const prepared = await waitForPrintReadiness(readiness)
      printReadyRef.current = null
      if (prepared.timedOut) {
        throw new Error('部分图片处理超时，请重试导出。')
      }
      setExportProgress(70)
      if (prepared.fallbackCount > 0) {
        setExportMessage(`${prepared.fallbackCount} 张图片已回退到原图或占位，正在导出…`)
      } else {
        setExportMessage('图片已就绪，正在生成 PDF…')
      }
      const result = await platform.export.pdf(current)
      if (!result) {
        setExportOpen(false)
        return
      }
      setExportProgress(100)
      setExportMessage(`${result.displayName} 已准备好`)
      toast.success(
        platform.kind === 'desktop' ? 'PDF 已导出' : '已打开打印窗口，可选择“保存为 PDF”'
      )
    } catch (error) {
      setExportProgress(0)
      setExportMessage(error instanceof Error ? error.message : '导出失败')
    } finally {
      printReadyRef.current = null
      setPrintDocument(null)
      setExporting(false)
    }
  }

  if (exclusiveWorkspace === 'preview') {
    return (
      <div className="app-shell flex h-dvh flex-col overflow-hidden">
        <PreviewWorkspace />
      </div>
    )
  }

  if (exclusiveWorkspace === 'erase-people' || exclusiveWorkspace === 'image-edit') {
    return (
      <div className="app-shell flex h-dvh flex-col overflow-hidden">
        <Suspense fallback={<WorkspaceLoading />}>
          {exclusiveWorkspace === 'erase-people' ? (
            <ErasePeopleWorkspace />
          ) : (
            <PhotoEditWorkspace />
          )}
        </Suspense>
      </div>
    )
  }

  return (
    <>
      <div className="app-shell flex h-dvh flex-col overflow-hidden">
        <header className="studio-header">
          <div className="studio-identity flex min-w-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void returnHome()}
                  disabled={returning}
                  aria-label="返回项目首页"
                >
                  <ArrowLeftIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>保存并返回项目首页</TooltipContent>
            </Tooltip>
            <BrandMark alt={BRAND_NAME} variant="compact" />
            <div className="project-identity min-w-0">
              <p className="truncate text-sm font-semibold">{document.title}</p>
              <SaveIndicator />
            </div>
          </div>
          <div className="studio-actions">
            <div className="history-actions">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={undo}
                disabled={!canUndo}
                aria-label="撤销"
              >
                <Undo2Icon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={redo}
                disabled={!canRedo}
                aria-label="重做"
              >
                <Redo2Icon />
              </Button>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="预览整册"
                  onClick={() => setExclusiveWorkspace('preview')}
                >
                  <EyeIcon data-icon="inline-start" />
                  <span className="action-label">预览整册</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>预览整册</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  aria-label={platform.kind === 'desktop' ? '导出 PDF' : '打印 / PDF'}
                  onClick={() => void exportPdf()}
                  disabled={exporting}
                >
                  <FileDownIcon data-icon="inline-start" />
                  <span className="action-label">
                    {platform.kind === 'desktop' ? '导出 PDF' : '打印 / PDF'}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {platform.kind === 'desktop' ? '导出 PDF' : '打印 / PDF'}
              </TooltipContent>
            </Tooltip>
          </div>
        </header>
        <Suspense fallback={<WorkspaceLoading />}>
          <BlockPlacementDragDropProvider>
            <EditorWorkspace />
          </BlockPlacementDragDropProvider>
        </Suspense>
      </div>
      {printDocument ? (
        <PrintBook document={printDocument} onReady={(result) => printReadyRef.current?.(result)} />
      ) : null}
      <Dialog open={exportOpen} onOpenChange={(open) => !exporting && setExportOpen(open)}>
        <DialogContent showCloseButton={!exporting}>
          <DialogHeader>
            <DialogTitle>
              {platform.kind === 'desktop' ? '导出整册 PDF' : '打印或保存为 PDF'}
            </DialogTitle>
            <DialogDescription>
              封面和全部页面使用同一套 {document.pageSpec.widthMm} × {document.pageSpec.heightMm} mm
              渲染。
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3">
              <Progress value={exportProgress} />
              <p className="text-sm text-muted-foreground">{exportMessage}</p>
            </div>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
