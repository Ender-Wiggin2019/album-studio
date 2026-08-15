import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { useStudioStore } from '@/app/store'
import { useAutoSave } from '@/app/use-auto-save'
import { StudioWorkspace } from '@/features/album-editor/studio-workspace'
import { ProjectsHome } from '@/features/projects/projects-home'

function App(): React.JSX.Element {
  const project = useStudioStore((state) => state.project)
  const openProject = useStudioStore((state) => state.openProject)
  useAutoSave()

  useEffect(
    () =>
      window.albumStudio.system.onCloseRequest(() => {
        void (async () => {
          try {
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
            await Promise.resolve()
            const state = useStudioStore.getState()
            if (state.project && state.projectPath && state.saveState !== 'saved') {
              state.markSaving()
              const saved = await window.albumStudio.projects.save({
                projectPath: state.projectPath,
                project: state.project
              })
              state.markSaved(saved.revision)
            }
            await window.albumStudio.system.closeReady({ ok: true })
          } catch (error) {
            const message = error instanceof Error ? error.message : '保存失败'
            useStudioStore.getState().markSaveError(message)
            toast.error(`关闭前保存失败：${message}`)
            await window.albumStudio.system.closeReady({ ok: false, error: message })
          }
        })()
      }),
    []
  )

  return (
    <TooltipProvider delayDuration={350}>
      {project ? <StudioWorkspace /> : <ProjectsHome onOpen={openProject} />}
      <Toaster />
    </TooltipProvider>
  )
}

export default App
import { useEffect } from 'react'
import { toast } from 'sonner'
