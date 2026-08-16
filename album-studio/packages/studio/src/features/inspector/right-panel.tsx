import { BlocksIcon, ImagesIcon, LayoutTemplateIcon, SlidersHorizontalIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useStudioStore, type RightPanelTab } from '@/app/store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProjectAssetsPanel } from '@/features/assets/asset-library'
import { PageLayoutPanel } from '@/features/layout/page-layout-panel'
import { cn } from '@/shared/lib/cn'
import { BlockEditPanel } from './block-edit-panel'

const ComponentLibraryPanel = lazy(async () => ({
  default: (await import('@/features/components/component-library-panel')).ComponentLibraryPanel
}))

export function RightPanel({ embedded = false }: { embedded?: boolean }): React.JSX.Element {
  const selectedBlockId = useStudioStore((state) => state.selectedBlockId)
  const rightPanelTab = useStudioStore((state) => state.rightPanelTab)
  const setRightPanelTab = useStudioStore((state) => state.setRightPanelTab)

  return (
    <aside
      className={cn(
        'right-panel min-h-0 min-w-0 overflow-hidden border-l bg-background',
        embedded && 'right-panel-embedded border-l-0'
      )}
      aria-label="装帧托盘"
    >
      <Tabs
        value={rightPanelTab}
        onValueChange={(value) => setRightPanelTab(value as RightPanelTab)}
        className="flex size-full min-h-0 flex-col"
      >
        <div className="shrink-0 border-b p-2">
          <TabsList className="grid w-full grid-flow-col auto-cols-fr">
            <TabsTrigger value="layout">
              <LayoutTemplateIcon className="size-3.5" />
              布局
            </TabsTrigger>
            <TabsTrigger value="assets">
              <ImagesIcon className="size-3.5" />
              素材
            </TabsTrigger>
            <TabsTrigger value="components">
              <BlocksIcon className="size-3.5" />
              组件
            </TabsTrigger>
            {selectedBlockId ? (
              <TabsTrigger value="block">
                <SlidersHorizontalIcon className="size-3.5" />
                编辑
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>
        <TabsContent value="layout" className="overflow-y-auto">
          <PageLayoutPanel />
        </TabsContent>
        <TabsContent value="assets" className="overflow-hidden">
          <ProjectAssetsPanel />
        </TabsContent>
        <TabsContent value="components" className="overflow-hidden">
          <Suspense
            fallback={
              <div className="grid min-h-52 place-items-center p-6 text-xs text-muted-foreground">
                正在打开组件库…
              </div>
            }
          >
            <ComponentLibraryPanel />
          </Suspense>
        </TabsContent>
        {selectedBlockId ? (
          <TabsContent value="block" className="overflow-y-auto">
            <BlockEditPanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </aside>
  )
}
