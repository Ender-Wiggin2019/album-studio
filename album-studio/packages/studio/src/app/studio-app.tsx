import { lazy, Suspense, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { resumeLastProject } from '@/app/platform/resume-last-project'
import { useStudioPlatform } from '@/app/platform/use-studio-platform'
import { useStudioStore } from '@/app/store'
import { hasPendingAssetImports, waitForAssetImports } from '@/app/pending-asset-imports'
import { ProjectsHome } from '@/pages/projects/projects-home'

const StudioWorkspace = lazy(async () => ({
  default: (await import('@/pages/studio/studio-workspace')).StudioWorkspace
}))

export function StudioApp(): React.JSX.Element {
  const platform = useStudioPlatform()
  const document = useStudioStore((state) => state.document)
  const [resuming, setResuming] = useState(true)

  useEffect(() => {
    useStudioStore.getState().connectPersistence((current) => platform.projects.save(current))
  }, [platform])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const resumed = await resumeLastProject(platform.projects)
        if (active && resumed) useStudioStore.getState().openDocument(resumed)
      } catch {
        // 自动继续失败时保留项目首页，用户仍可手动选择相册。
      } finally {
        if (active) setResuming(false)
      }
    })()
    return () => {
      active = false
    }
  }, [platform])

  useEffect(
    () =>
      platform.lifecycle.onCloseRequest(() => {
        void (async () => {
          try {
            if (globalThis.document.activeElement instanceof HTMLElement) {
              globalThis.document.activeElement.blur()
            }
            await waitForAssetImports()
            await useStudioStore.getState().flush()
            await platform.lifecycle.closeReady({ ok: true })
          } catch (error) {
            const message = error instanceof Error ? error.message : '保存失败'
            toast.error(`关闭前保存失败：${message}`)
            await platform.lifecycle.closeReady({ ok: false, error: message })
          }
        })()
      }),
    [platform]
  )

  useEffect(() => {
    const preventUnloadDuringImport = (event: BeforeUnloadEvent): void => {
      if (!hasPendingAssetImports()) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventUnloadDuringImport)
    return () => window.removeEventListener('beforeunload', preventUnloadDuringImport)
  }, [])

  return (
    <TooltipProvider delayDuration={350}>
      {document ? (
        <Suspense
          fallback={
            <div className="grid h-dvh place-items-center text-sm text-muted-foreground">
              正在打开相册…
            </div>
          }
        >
          <StudioWorkspace />
        </Suspense>
      ) : resuming ? (
        <div className="grid h-dvh place-items-center text-sm text-muted-foreground">
          正在打开上次的相册…
        </div>
      ) : (
        <ProjectsHome />
      )}
      <Toaster />
    </TooltipProvider>
  )
}
