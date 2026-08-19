import {
  type AlbumCommand,
  type AssetRecord
} from '@album-studio/common'
import {
  EyeIcon,
  FolderPlusIcon,
  ImagePlusIcon,
  ImagesIcon,
  Maximize2Icon,
  Minimize2Icon,
  SearchIcon,
  XIcon
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ImportCandidate } from '@/app/platform/studio-platform'
import { useStudioPlatform } from '@/app/platform/use-studio-platform'
import { useStudioStore } from '@/app/store'
import { useDraggableBlockSource } from '@/features/block-placement/draggable-block-source'
import { buildAddBlockCommand } from '@/features/block-placement/drop-coordinate'
import { AssetImage } from '@/shared/assets/asset-image'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { PhotoPreviewOverlay, type PhotoPreviewItem } from './photo-preview-overlay'
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
import { ImportCandidatesDialog } from './import-candidates-dialog'

type SortMode = 'name' | 'imported'

function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  )
}

function ProjectAssetCard({
  documentId,
  asset,
  selected,
  missing,
  canPlace,
  canRelink,
  relinking,
  onAdd,
  onToggle,
  onView,
  onRelink,
  onMissing,
  onAvailable
}: {
  documentId: string
  asset: AssetRecord
  selected: boolean
  missing: boolean
  canPlace: boolean
  canRelink: boolean
  relinking: boolean
  onAdd: () => void
  onToggle: () => void
  onView: () => void
  onRelink: () => void
  onMissing: () => void
  onAvailable: () => void
}): React.JSX.Element {
  const payload = { kind: 'asset', assetId: asset.id } as const
  const { ref, isDragging } = useDraggableBlockSource(payload, {
    disabled: missing || !canPlace
  })
  const disabled = missing ? !canRelink || relinking : !canPlace

  return (
    <div
      className="group relative min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs transition-colors hover:border-primary/45 data-[dragging=true]:opacity-55 data-[selected=true]:border-primary data-[selected=true]:ring-1 data-[selected=true]:ring-primary/30"
      data-dragging={isDragging || undefined}
      data-selected={selected || undefined}
    >
      <button
        ref={ref}
        type="button"
        onClick={() => (missing ? onRelink() : onAdd())}
        disabled={disabled}
        aria-label={missing ? `重新定位 ${asset.fileName}` : `添加 ${asset.fileName} 到当前页`}
        title={missing ? '重新定位图片' : '点击居中添加，或拖到画布指定位置'}
        className="w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-65"
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          {missing ? (
            <span className="grid size-full place-items-center px-2 text-center text-[11px] text-destructive">
              {canRelink ? '文件缺失 · 点击重新定位' : '图片数据不可用'}
            </span>
          ) : (
            <AssetImage
              documentId={documentId}
              assetId={asset.id}
              sourceRequest={{ quality: 'thumbnail' }}
              alt={asset.fileName}
              loading="lazy"
              decoding="async"
              onSourceError={onMissing}
              onLoad={onAvailable}
              className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.025]"
            />
          )}
        </div>
        <div className="min-w-0 p-2">
          <p className="truncate text-xs font-medium" title={asset.fileName}>
            {asset.fileName}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {asset.width} × {asset.height}
          </p>
        </div>
      </button>
      {!missing ? (
        <>
          <span className="absolute left-1.5 top-1.5">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              aria-label={`选择 ${asset.fileName}`}
              title="加入批量选择"
            />
          </span>
          <button
            type="button"
            onClick={onView}
            aria-label={`查看大图 ${asset.fileName}`}
            title="查看大图"
            className="absolute right-1.5 top-1.5 cursor-pointer rounded bg-background/85 p-1 text-muted-foreground shadow-xs transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <EyeIcon className="size-3.5" />
          </button>
        </>
      ) : null}
    </div>
  )
}

export function ProjectAssetsPanel(): React.JSX.Element {
  const platform = useStudioPlatform()
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectPage = useStudioStore((state) => state.selectPage)
  const selectedAssetIds = useStudioStore((state) => state.selectedAssetIds)
  const toggleAsset = useStudioStore((state) => state.toggleAsset)
  const setAssetSelection = useStudioStore((state) => state.setAssetSelection)
  const clearAssetSelection = useStudioStore((state) => state.clearAssetSelection)
  const dispatch = useStudioStore((state) => state.dispatch)
  const dispatchMany = useStudioStore((state) => state.dispatchMany)
  const missingAssetIds = useStudioStore((state) => state.missingAssetIds)
  const markAssetMissing = useStudioStore((state) => state.markAssetMissing)
  const markAssetAvailable = useStudioStore((state) => state.markAssetAvailable)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [importing, setImporting] = useState(false)
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null)
  const [destinationOpen, setDestinationOpen] = useState(false)
  const [lastSkipped, setLastSkipped] = useState<Array<{ fileName: string; reason: string }>>([])
  const [relinkingAssetId, setRelinkingAssetId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const canImportFolder = platform.capabilities.has('folder-import')
  const canRelink = platform.capabilities.has('asset-relink')

  const assets = useMemo(() => {
    if (!document) return []
    const normalized = deferredQuery.trim().toLocaleLowerCase('zh-CN')
    return [...document.assets]
      .filter(
        (asset) => !normalized || asset.fileName.toLocaleLowerCase('zh-CN').includes(normalized)
      )
      .sort((left, right) =>
        sortMode === 'name'
          ? left.fileName.localeCompare(right.fileName, 'zh-CN', { numeric: true })
          : right.importedAt.localeCompare(left.importedAt)
      )
  }, [deferredQuery, document, sortMode])

  useEffect(() => {
    if (!expanded || previewIndex !== null || candidates !== null || destinationOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        event.stopImmediatePropagation()
        setExpanded(false)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [candidates, destinationOpen, expanded, previewIndex])

  if (!document) return <div />
  const selectedPage = document.pages.find((page) => page.id === selectedPageId)
  const currentCapacity = selectedPage ? Math.max(0, 100 - selectedPage.blocks.length) : 0

  const pickCandidates = async (source: 'files' | 'folder'): Promise<void> => {
    try {
      const picked = await platform.assets.pickCandidates(document.id, source)
      if (!picked || picked.length === 0) return
      setCandidates(picked)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '选择照片失败')
    }
  }

  const importSelectedCandidates = async (candidateIds: string[]): Promise<void> => {
    setImporting(true)
    try {
      const result = await platform.assets.importCandidates(document.id, candidateIds)
      if (!result) return
      setLastSkipped(result.skipped)
      if (result.assets.length) {
        dispatch({ type: 'register-assets', assets: result.assets })
        setAssetSelection(result.assets.map((asset) => asset.id))
        toast.success(`已导入 ${result.assets.length} 张照片。`)
      }
      if (result.duplicateAssetIds.length) {
        toast.info(`发现 ${result.duplicateAssetIds.length} 张重复照片，原图只保存一份。`)
      }
      if (result.skipped.length) toast.warning(`已跳过 ${result.skipped.length} 个无法读取的文件。`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入照片失败')
    } finally {
      setImporting(false)
      closeCandidatesDialog()
    }
  }

  const closeCandidatesDialog = (): void => {
    if (candidates) platform.assets.releaseCandidates(candidates.map((candidate) => candidate.id))
    setCandidates(null)
  }

  const relinkAsset = async (assetId: string): Promise<void> => {
    if (!canRelink) return
    setRelinkingAssetId(assetId)
    try {
      const restored = await platform.assets.relink(document.id, assetId)
      if (!restored) return
      markAssetAvailable(assetId)
      toast.success('照片原文件已恢复。')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法恢复照片')
    } finally {
      setRelinkingAssetId(null)
    }
  }

  const addAssetToCurrentPage = (assetId: string): void => {
    if (!selectedPage) return
    const asset = document.assets.find((candidate) => candidate.id === assetId)
    dispatch(
      buildAddBlockCommand(selectedPage.id, { kind: 'asset', assetId }, {
        assetSize: asset ? { width: asset.width, height: asset.height } : undefined,
        pageSpec: document.pageSpec
      })
    )
  }

  const placeOnCurrentPage = (): void => {
    if (!selectedPage || selectedAssetIds.length === 0) return
    const accepted = selectedAssetIds.slice(0, currentCapacity)
    if (accepted.length === 0) return
    dispatch({
      type: 'place-assets',
      pageId: selectedPage.id,
      assetIds: accepted
    })
    setAssetSelection(selectedAssetIds.slice(accepted.length))
    setDestinationOpen(false)
  }

  const createPages = (): void => {
    const groups = chunks(selectedAssetIds, 6)
    const firstCreatedPageIndex = document.pages.length
    const afterPageId = document.pages.at(-1)?.id
    const commands: AlbumCommand[] = [...groups].reverse().map((group) => ({
      type: 'add-page',
      ...(afterPageId ? { afterPageId } : {}),
      assetIds: group
    }))
    dispatchMany(commands)
    const firstCreatedPageId = useStudioStore.getState().document?.pages[firstCreatedPageIndex]?.id
    if (firstCreatedPageId) selectPage(firstCreatedPageId)
    clearAssetSelection()
    setDestinationOpen(false)
  }

  const visibleIds = assets.map((asset) => asset.id)
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedAssetIds.includes(id))

  const previewItems: PhotoPreviewItem[] = assets
    .filter((asset) => !missingAssetIds.includes(asset.id))
    .map((asset) => ({
      id: asset.id,
      label: asset.fileName,
      renderLarge: () => (
        <AssetImage
          documentId={document.id}
          assetId={asset.id}
          sourceRequest={{ quality: 'preview' }}
          alt={asset.fileName}
          className="max-h-[82dvh] max-w-[86vw] object-contain"
        />
      ),
      renderFooter: () => (
        <Button
          size="sm"
          onClick={() => addAssetToCurrentPage(asset.id)}
          disabled={!selectedPage || currentCapacity === 0}
        >
          <ImagePlusIcon data-icon="inline-start" />
          添加到当前页
        </Button>
      )
    }))

  return (
    <section
      className={cn(
        'relative flex min-h-0 flex-col overflow-hidden bg-background',
        expanded ? 'fixed inset-0 z-50 w-auto' : 'h-full w-[360px] max-w-full'
      )}
      aria-label="项目素材"
    >
      <div className="shrink-0 border-b p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目照片"
            aria-label="搜索项目照片"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="清除搜索"
              title="清除搜索"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] gap-1.5">
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
            <SelectTrigger className="h-8 min-w-0 text-xs" aria-label="照片排序">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">按文件名</SelectItem>
              <SelectItem value="imported">按导入时间</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => void pickCandidates('files')}
            disabled={importing}
            aria-label="选择图片"
            title="选择图片"
          >
            <ImagePlusIcon />
          </Button>
          {canImportFolder ? (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => void pickCandidates('folder')}
              disabled={importing}
              aria-label="选择照片文件夹"
              title="选择照片文件夹"
            >
              <FolderPlusIcon />
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setExpanded((value) => !value)}
            aria-label={expanded ? '退出全屏' : '全屏查看素材'}
            title={expanded ? '退出全屏' : '全屏查看素材'}
          >
            {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
          </Button>
        </div>
      </div>

      {importing ? (
        <div className="shrink-0 border-b bg-primary/5 px-3 py-2">
          <p className="mb-1.5 text-xs">正在保存原图并生成预览…</p>
          <Progress />
        </div>
      ) : null}

      {lastSkipped.length ? (
        <details className="shrink-0 border-b bg-destructive/5 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-destructive">
            {lastSkipped.length} 个文件未导入 · 查看详情
          </summary>
          <ul className="mt-2 grid max-h-28 gap-1 overflow-y-auto text-[11px] text-muted-foreground">
            {lastSkipped.map((item, index) => (
              <li key={`${item.fileName}-${index}`}>
                {item.fileName}：{item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {document.assets.length === 0 ? (
        <div className="grid flex-1 place-items-center p-5 text-center">
          <div>
            <span className="mx-auto grid size-11 place-items-center rounded-lg bg-muted">
              <ImagesIcon className="size-5 text-muted-foreground" />
            </span>
            <h2 className="mt-3 text-sm font-semibold">导入项目照片</h2>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
              支持 JPEG、PNG、WebP 与 AVIF。
            </p>
            <Button
              className="mt-4"
              size="sm"
              onClick={() => void pickCandidates(canImportFolder ? 'folder' : 'files')}
              disabled={importing}
            >
              <ImagePlusIcon data-icon="inline-start" />
              选择照片
            </Button>
          </div>
        </div>
      ) : assets.length === 0 ? (
        <div className="grid flex-1 place-items-center p-5 text-center">
          <div>
            <SearchIcon className="mx-auto size-5 text-muted-foreground" />
            <h2 className="mt-2 text-sm font-semibold">没有找到“{deferredQuery}”</h2>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setQuery('')}>
              清除搜索
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24">
          <div className="mb-2.5 flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
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
            <span className="text-[11px] text-muted-foreground">{assets.length} 张</span>
          </div>
          <div className={cn('grid gap-2', expanded ? 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5' : 'grid-cols-2')}>
            {assets.map((asset) => (
              <ProjectAssetCard
                key={asset.id}
                documentId={document.id}
                asset={asset}
                selected={selectedAssetIds.includes(asset.id)}
                missing={missingAssetIds.includes(asset.id)}
                canPlace={Boolean(selectedPage) && currentCapacity > 0}
                canRelink={canRelink}
                relinking={relinkingAssetId === asset.id}
                onAdd={() => addAssetToCurrentPage(asset.id)}
                onToggle={() => toggleAsset(asset.id)}
                onView={() => {
                  const previewAssetIndex = previewItems.findIndex((item) => item.id === asset.id)
                  if (previewAssetIndex >= 0) setPreviewIndex(previewAssetIndex)
                }}
                onRelink={() => void relinkAsset(asset.id)}
                onMissing={() => markAssetMissing(asset.id)}
                onAvailable={() => markAssetAvailable(asset.id)}
              />
            ))}
          </div>
        </div>
      )}

      {selectedAssetIds.length ? (
        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-2 border-t bg-background/96 px-3 py-2.5 shadow-[0_-10px_24px_rgb(15_23_42/8%)] backdrop-blur-sm">
          <div>
            <p className="text-xs font-semibold">已选 {selectedAssetIds.length} 张</p>
            <button
              type="button"
              className="mt-0.5 cursor-pointer text-[11px] text-muted-foreground hover:text-foreground"
              onClick={clearAssetSelection}
            >
              取消选择
            </button>
          </div>
          <Button size="sm" onClick={() => setDestinationOpen(true)}>
            批量添加
          </Button>
        </div>
      ) : null}

      <ImportCandidatesDialog
        open={candidates !== null}
        candidates={candidates ?? []}
        importing={importing}
        onConfirm={(candidateIds) => void importSelectedCandidates(candidateIds)}
        onClose={closeCandidatesDialog}
      />

      <PhotoPreviewOverlay
        items={previewItems}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewIndex(null)}
      />

      <Dialog open={destinationOpen} onOpenChange={setDestinationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量添加照片</DialogTitle>
            <DialogDescription>已选择 {selectedAssetIds.length} 张照片。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3">
              <Button className="h-auto justify-start py-3" onClick={createPages}>
                自动创建新页 · 每页最多 6 张
              </Button>
              <Button
                variant="outline"
                className="h-auto justify-start py-3"
                onClick={placeOnCurrentPage}
                disabled={!selectedPage || currentCapacity === 0}
              >
                添加到当前页 · 可再放 {currentCapacity} 张
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
