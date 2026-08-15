import { FolderPlusIcon, ImagePlusIcon, ImagesIcon, SearchIcon, XIcon } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useStudioStore } from '@/app/store'

type SortMode = 'name' | 'imported'

export function AssetLibrary(): React.JSX.Element {
  const project = useStudioStore((state) => state.project)
  const projectPath = useStudioStore((state) => state.projectPath)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedAssetIds = useStudioStore((state) => state.selectedAssetIds)
  const toggleAsset = useStudioStore((state) => state.toggleAsset)
  const setAssetSelection = useStudioStore((state) => state.setAssetSelection)
  const clearAssetSelection = useStudioStore((state) => state.clearAssetSelection)
  const addSelectedAssetsToAlbum = useStudioStore((state) => state.addSelectedAssetsToAlbum)
  const mutateProject = useStudioStore((state) => state.mutateProject)
  const missingAssetIds = useStudioStore((state) => state.missingAssetIds)
  const markAssetMissing = useStudioStore((state) => state.markAssetMissing)
  const markAssetAvailable = useStudioStore((state) => state.markAssetAvailable)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [importing, setImporting] = useState(false)
  const [destinationOpen, setDestinationOpen] = useState(false)
  const [lastSkipped, setLastSkipped] = useState<Array<{ fileName: string; reason: string }>>([])
  const [relinkingAssetId, setRelinkingAssetId] = useState<string | null>(null)

  const assets = useMemo(() => {
    if (!project) return []
    const normalized = deferredQuery.trim().toLocaleLowerCase('zh-CN')
    return project.assets
      .filter(
        (asset) => !normalized || asset.fileName.toLocaleLowerCase('zh-CN').includes(normalized)
      )
      .toSorted((a, b) =>
        sortMode === 'name'
          ? a.fileName.localeCompare(b.fileName, 'zh-CN', { numeric: true })
          : b.importedAt.localeCompare(a.importedAt)
      )
  }, [deferredQuery, project, sortMode])

  if (!project || !projectPath) return <div />

  const selectedPage = project.pages.find((candidate) => candidate.id === selectedPageId)
  const currentCapacity =
    selectedPage?.kind === 'content' ? selectedPage.slots.filter((slot) => !slot.assetId).length : 0

  const addToAlbum = (destination: 'auto' | 'current' | 'new'): void => {
    addSelectedAssetsToAlbum(destination)
    setDestinationOpen(false)
  }

  const relinkAsset = async (assetId: string): Promise<void> => {
    setRelinkingAssetId(assetId)
    try {
      const restored = await window.albumStudio.assets.relink({ projectPath, assetId })
      if (!restored) return
      mutateProject((draft) => {
        const index = draft.assets.findIndex((asset) => asset.id === restored.id)
        if (index >= 0) draft.assets[index] = restored
      })
      markAssetAvailable(assetId)
      toast.success('照片已恢复。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法恢复照片')
    } finally {
      setRelinkingAssetId(null)
    }
  }

  const importAssets = async (source: 'files' | 'folder'): Promise<void> => {
    setImporting(true)
    try {
      const result = await window.albumStudio.assets.import({ projectPath, source })
      if (!result) return
      setLastSkipped(result.skipped)
      if (result.assets.length) {
        mutateProject((draft) => {
          const existing = new Set(draft.assets.map((asset) => asset.id))
          draft.assets.push(...result.assets.filter((asset) => !existing.has(asset.id)))
        })
        setAssetSelection(result.assets.map((asset) => asset.id))
      }
      if (result.duplicateAssetIds.length)
        toast.info(`发现 ${result.duplicateAssetIds.length} 张重复照片，素材库只保留一份。`)
      if (result.skipped.length) toast.warning(`已跳过 ${result.skipped.length} 个无法读取的文件。`)
      if (result.assets.length) toast.success(`已导入 ${result.assets.length} 张照片。`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入照片失败')
    } finally {
      setImporting(false)
    }
  }

  const visibleIds = assets.map((asset) => asset.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedAssetIds.includes(id))

  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
      aria-label="素材库"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-4 lg:px-7">
        <div className="relative min-w-56 flex-1 md:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="按文件名搜索照片"
            className="pl-9 pr-9"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="清除搜索"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>
        <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">按文件名</SelectItem>
            <SelectItem value="imported">按导入时间</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => void importAssets('files')} disabled={importing}>
          <ImagePlusIcon data-icon="inline-start" />
          选择图片
        </Button>
        <Button
          variant={project.assets.length ? 'outline' : 'default'}
          onClick={() => void importAssets('folder')}
          disabled={importing}
        >
          <FolderPlusIcon data-icon="inline-start" />
          选择照片文件夹
        </Button>
      </div>

      {importing ? (
        <div className="shrink-0 border-b bg-primary/5 px-5 py-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span>正在复制照片并生成预览…</span>
            <span className="text-muted-foreground">请保持应用打开</span>
          </div>
          <Progress />
        </div>
      ) : null}

      {lastSkipped.length ? (
        <details className="shrink-0 border-b bg-destructive/5 px-5 py-3 text-sm">
          <summary className="cursor-pointer font-medium text-destructive">
            {lastSkipped.length} 个文件未能导入 · 查看详情
          </summary>
          <ul className="mt-2 grid max-h-32 gap-1 overflow-y-auto text-xs text-muted-foreground">
            {lastSkipped.map((item, index) => (
              <li key={`${item.fileName}-${index}`}>
                {item.fileName}：{item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {project.assets.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <span className="mx-auto grid size-14 place-items-center rounded-xl bg-muted">
              <ImagesIcon className="size-6 text-muted-foreground" />
            </span>
            <h2 className="mt-4 font-semibold">素材库还是空的</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              选择一个照片文件夹，应用会把 JPEG、PNG 和 WebP 原图复制进当前项目。
            </p>
            <Button
              className="mt-5"
              onClick={() => void importAssets('folder')}
              disabled={importing}
            >
              <FolderPlusIcon data-icon="inline-start" />
              选择照片文件夹
            </Button>
          </div>
        </div>
      ) : assets.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <SearchIcon className="mx-auto size-6 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">没有找到“{deferredQuery}”</h2>
            <Button className="mt-4" variant="outline" onClick={() => setQuery('')}>
              清除搜索
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-28 lg:p-7 lg:pb-28">
          <div className="mb-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={(checked) =>
                  setAssetSelection(
                    checked ? visibleIds : selectedAssetIds.filter((id) => !visibleIds.includes(id))
                  )
                }
              />
              选择当前结果
            </label>
            <span className="text-xs text-muted-foreground">{assets.length} 张照片</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
            {assets.map((asset) => {
              const selected = selectedAssetIds.includes(asset.id)
              const missing = missingAssetIds.includes(asset.id)
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    if (missing) void relinkAsset(asset.id)
                    else toggleAsset(asset.id)
                  }}
                  disabled={relinkingAssetId === asset.id}
                  className="group min-w-0 overflow-hidden rounded-lg border bg-card text-left shadow-xs outline-none transition-colors hover:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring data-[selected=true]:border-primary data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30"
                  data-selected={selected}
                >
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {missing ? (
                      <span className="grid size-full place-items-center px-3 text-center text-xs text-destructive">
                        {relinkingAssetId === asset.id ? '正在验证…' : '文件缺失 · 点击重新定位'}
                      </span>
                    ) : (
                      <>
                        <img
                          src={window.albumStudio.assets.url(project.id, asset.id)}
                          alt={asset.fileName}
                          loading="lazy"
                          onError={() => markAssetMissing(asset.id)}
                          onLoad={() => markAssetAvailable(asset.id)}
                          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.025]"
                        />
                        <span
                          className="absolute left-2 top-2"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => toggleAsset(asset.id)}
                            aria-label={`选择 ${asset.fileName}`}
                          />
                        </span>
                      </>
                    )}
                  </div>
                  <div className="min-w-0 p-2.5">
                    <p className="truncate text-xs font-medium" title={asset.fileName}>
                      {asset.fileName}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {asset.width && asset.height
                        ? `${asset.width} × ${asset.height}`
                        : '尺寸待识别'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedAssetIds.length ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t bg-background/96 px-5 py-4 shadow-[0_-12px_30px_rgb(15_23_42/8%)] backdrop-blur-sm lg:px-7">
          <div>
            <p className="text-sm font-semibold">已选 {selectedAssetIds.length} 张</p>
            <p className="text-xs text-muted-foreground">
              将按项目默认的每页 {project.defaultPhotosPerPage} 张自动分页
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={clearAssetSelection}>
              取消选择
            </Button>
            <Button onClick={() => setDestinationOpen(true)}>添加到相册</Button>
          </div>
        </div>
      ) : null}
      <Dialog open={destinationOpen} onOpenChange={setDestinationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>把照片添加到哪里？</DialogTitle>
            <DialogDescription>已选择 {selectedAssetIds.length} 张照片。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3">
              <Button className="h-auto justify-start py-3" onClick={() => addToAlbum('auto')}>
                自动分页 · 优先填满当前页空位
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start py-3"
                onClick={() => addToAlbum('current')}
                disabled={currentCapacity === 0}
              >
                添加到当前页 · 还有 {currentCapacity} 个空位
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start py-3"
                onClick={() => addToAlbum('new')}
              >
                从新页面开始
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDestinationOpen(false)}>
              取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
