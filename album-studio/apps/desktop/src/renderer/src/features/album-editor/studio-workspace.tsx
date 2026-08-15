import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  FileDownIcon,
  ImagesIcon,
  LayoutTemplateIcon,
  PanelRightIcon,
  Redo2Icon,
  Undo2Icon
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStudioStore } from '@/app/store'
import { AssetLibrary } from '@/features/assets/asset-library'
import { EditorWorkspace } from './editor-workspace'
import { PhotoEditWorkspace } from './photo-edit-workspace'
import { PreviewWorkspace } from './preview-workspace'
import { PrintBook } from './album-page-view'

function SaveIndicator(): React.JSX.Element {
  const saveState = useStudioStore((state) => state.saveState)
  const saveError = useStudioStore((state) => state.saveError)
  const retrySave = useStudioStore((state) => state.retrySave)
  if (saveState === 'saving' || saveState === 'dirty')
    return <span className="save-indicator text-muted-foreground">正在保存…</span>
  if (saveState === 'error')
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
  return (
    <span className="save-indicator text-muted-foreground">
      <CheckIcon className="size-3.5" />
      已保存
    </span>
  )
}

export function StudioWorkspace(): React.JSX.Element {
  const project = useStudioStore((state) => state.project)
  const projectPath = useStudioStore((state) => state.projectPath)
  const mode = useStudioStore((state) => state.mode)
  const setMode = useStudioStore((state) => state.setMode)
  const saveState = useStudioStore((state) => state.saveState)
  const markSaving = useStudioStore((state) => state.markSaving)
  const markSaved = useStudioStore((state) => state.markSaved)
  const markSaveError = useStudioStore((state) => state.markSaveError)
  const closeProject = useStudioStore((state) => state.closeProject)
  const undo = useStudioStore((state) => state.undo)
  const redo = useStudioStore((state) => state.redo)
  const canUndo = useStudioStore((state) => state.history.past.length > 0)
  const canRedo = useStudioStore((state) => state.history.future.length > 0)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportMessage, setExportMessage] = useState('准备页面资源…')
  const [returning, setReturning] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable=true]')) return
      event.preventDefault()
      if (event.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [redo, undo])

  if (!project || !projectPath) return <div />

  const returnHome = async (): Promise<void> => {
    if (returning) return
    setReturning(true)
    try {
      if (saveState === 'dirty' || saveState === 'saving' || saveState === 'error') {
        markSaving()
        const saved = await window.albumStudio.projects.save({ projectPath, project })
        markSaved(saved.revision)
      }
      closeProject()
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败'
      markSaveError(message)
      toast.error(`无法返回项目首页：${message}`)
    } finally {
      setReturning(false)
    }
  }

  const exportPdf = async (): Promise<void> => {
    setExportOpen(true)
    setExporting(true)
    setExportProgress(28)
    setExportMessage('正在等待图片与字体…')
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 80))
      setExportProgress(64)
      setExportMessage('正在生成 A4 横向 PDF…')
      const result = await window.albumStudio.export.pdf({
        projectPath,
        suggestedName: project.title,
        revision: project.revision
      })
      if (!result) {
        setExportOpen(false)
        return
      }
      setExportProgress(100)
      setExportMessage('PDF 已导出')
      toast.success(`PDF 已导出（${Math.ceil(result.byteSize / 1024)} KB）`)
    } catch (error) {
      setExportProgress(0)
      setExportMessage(error instanceof Error ? error.message : 'PDF 导出失败')
    } finally {
      setExporting(false)
    }
  }

  if (mode === 'photo-edit')
    return (
      <>
        <div className="app-shell flex h-dvh flex-col overflow-hidden">
          <PhotoEditWorkspace />
        </div>
      </>
    )

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
              <TooltipContent>返回项目首页</TooltipContent>
            </Tooltip>
            <div className="project-identity min-w-0">
              <p className="truncate text-sm font-semibold">{project.title}</p>
              <SaveIndicator />
            </div>
          </div>
          <nav className="workspace-nav" aria-label="项目工作区">
            <button
              type="button"
              data-active={mode === 'library'}
              onClick={() => setMode('library')}
            >
              <ImagesIcon />
              素材库
            </button>
            <button
              type="button"
              data-active={mode === 'layout' || mode === 'preview'}
              onClick={() => setMode('layout')}
            >
              <LayoutTemplateIcon />
              排版
            </button>
          </nav>
          <div className="studio-actions">
            <div className="history-actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={undo}
                    disabled={!canUndo}
                    aria-label="撤销"
                  >
                    <Undo2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>撤销 · Ctrl/Cmd Z</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={redo}
                    disabled={!canRedo}
                    aria-label="重做"
                  >
                    <Redo2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>重做 · Ctrl/Cmd Shift Z</TooltipContent>
              </Tooltip>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMode('preview')}>
              <EyeIcon data-icon="inline-start" />
              <span className="action-label">预览整册</span>
            </Button>
            <Button
              size="sm"
              onClick={() => void exportPdf()}
              disabled={saveState !== 'saved' || exporting}
            >
              <FileDownIcon data-icon="inline-start" />
              <span className="action-label">导出 PDF</span>
            </Button>
          </div>
        </header>
        {mode === 'library' ? (
          <AssetLibrary />
        ) : mode === 'preview' ? (
          <PreviewWorkspace />
        ) : (
          <EditorWorkspace />
        )}
      </div>
      {exportOpen ? <PrintBook project={project} /> : null}
      <Dialog open={exportOpen} onOpenChange={(open) => !exporting && setExportOpen(open)}>
        <DialogContent showCloseButton={!exporting}>
          <DialogHeader>
            <DialogTitle>导出整册 PDF</DialogTitle>
            <DialogDescription>封面和全部照片页将按 A4 横向尺寸写入一个 PDF。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3">
              <Progress value={exportProgress} />
              <div className="flex items-start gap-2 text-sm">
                <PanelRightIcon className="mt-0.5 size-4 text-muted-foreground" />
                <span>{exportMessage}</span>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            {!exporting ? (
              <Button onClick={() => setExportOpen(false)}>
                {exportProgress === 100 ? '完成' : '关闭'}
              </Button>
            ) : (
              <Button disabled>正在导出…</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
