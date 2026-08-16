import { lazy, Suspense, useEffect } from 'react'
import { toast } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { useStudioPlatform } from '@/app/platform/use-studio-platform'
import { useStudioStore } from '@/app/store'
import { ProjectsHome } from '@/pages/projects/projects-home'

const StudioWorkspace = lazy(async () => ({
  default: (await import('@/pages/studio/studio-workspace')).StudioWorkspace
}))

export function StudioApp(): React.JSX.Element {
  const platform = useStudioPlatform()
  const document = useStudioStore((state) => state.document)

  useEffect(() => {
    useStudioStore.getState().connectPersistence((current) => platform.projects.save(current))
  }, [platform])

  useEffect(
    () =>
      platform.lifecycle.onCloseRequest(() => {
        void (async () => {
          try {
            if (globalThis.document.activeElement instanceof HTMLElement) {
              globalThis.document.activeElement.blur()
            }
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
      ) : (
        <ProjectsHome />
      )}
      <Toaster />
    </TooltipProvider>
  )
}
