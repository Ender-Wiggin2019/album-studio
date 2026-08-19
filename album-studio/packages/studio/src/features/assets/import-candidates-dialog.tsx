import { useState } from 'react'
import { EyeIcon } from 'lucide-react'
import type { ImportCandidate } from '@/app/platform/studio-platform'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { cn } from '@/shared/lib/cn'
import { Spinner } from '@/components/ui/spinner'
import { PhotoPreviewOverlay, type PhotoPreviewItem } from './photo-preview-overlay'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function CandidateCard({
  candidate,
  selected,
  disabled,
  onToggle,
  onView
}: {
  candidate: ImportCandidate
  selected: boolean
  disabled: boolean
  onToggle: () => void
  onView: () => void
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'group relative min-w-0 overflow-hidden rounded-md border bg-card transition-colors hover:border-primary/45',
        selected && 'border-primary ring-1 ring-primary/30'
      )}
      data-selected={selected || undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={`选择 ${candidate.fileName}`}
        className="w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          {candidate.previewUrl ? (
            <img
              src={candidate.previewUrl}
              alt={candidate.fileName}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.025]"
            />
          ) : (
            <span className="grid size-full place-items-center text-[11px] text-muted-foreground">
              无法预览
            </span>
          )}
        </div>
        <div className="min-w-0 p-2">
          <p className="truncate text-xs font-medium" title={candidate.fileName}>
            {candidate.fileName}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {formatBytes(candidate.byteSize)}
            {candidate.width && candidate.height
              ? ` · ${candidate.width} × ${candidate.height}`
              : ''}
          </p>
        </div>
      </button>
      <span className="absolute left-1.5 top-1.5">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          disabled={disabled}
          aria-label={`选择 ${candidate.fileName}`}
          title="勾选后导入"
        />
      </span>
      <button
        type="button"
        onClick={onView}
        disabled={disabled}
        aria-label={`查看大图 ${candidate.fileName}`}
        title="查看大图"
        className="absolute right-1.5 top-1.5 cursor-pointer rounded bg-background/85 p-1 text-muted-foreground shadow-xs transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <EyeIcon className="size-3.5" />
      </button>
    </div>
  )
}

export function ImportCandidatesDialog({
  open,
  candidates,
  importing,
  error,
  onConfirm,
  onClose
}: {
  open: boolean
  candidates: ImportCandidate[]
  importing: boolean
  error: string | null
  onConfirm: (candidateIds: string[]) => void
  onClose: () => void
}): React.JSX.Element {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const [previousOpen, setPreviousOpen] = useState(open)

  if (open !== previousOpen) {
    setPreviousOpen(open)
    if (open) {
      setSelectedIds(new Set())
      setPreviewIndex(null)
    }
  }

  const allVisibleSelected =
    candidates.length > 0 && candidates.every((candidate) => selectedIds.has(candidate.id))

  const toggleCandidate = (id: string): void => {
    if (importing) return
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAll = (): void => {
    if (importing) return
    setSelectedIds(
      allVisibleSelected ? new Set() : new Set(candidates.map((candidate) => candidate.id))
    )
  }

  const previewItems: PhotoPreviewItem[] = candidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.fileName,
    renderLarge: () => (
      <img
        src={candidate.previewUrl}
        alt={candidate.fileName}
        className="max-h-[82dvh] max-w-[86vw] object-contain"
      />
    )
  }))

  return (
    <Dialog open={open} onOpenChange={(next) => (!next && !importing ? onClose() : undefined)}>
      <DialogContent
        className="max-w-2xl"
        showCloseButton={!importing}
        onEscapeKeyDown={(event) => {
          if (importing) event.preventDefault()
        }}
        onPointerDownOutside={(event) => {
          if (importing) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (importing) event.preventDefault()
        }}
      >
        <DialogHeader>
          <DialogTitle>选择要导入的照片</DialogTitle>
          <DialogDescription>
            共 {candidates.length} 张照片，已选 {selectedIds.size} 张。未勾选的照片不会导入。
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="mb-3 flex items-center justify-between">
            <label
              className={cn(
                'flex cursor-pointer items-center gap-1.5 text-xs',
                importing && 'cursor-not-allowed opacity-60'
              )}
            >
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={toggleAll}
                disabled={importing}
              />
              全选 / 全不选
            </label>
            <span className="text-[11px] text-muted-foreground">
              {selectedIds.size} / {candidates.length} 张
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {candidates.map((candidate, candidateIndex) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                selected={selectedIds.has(candidate.id)}
                disabled={importing}
                onToggle={() => toggleCandidate(candidate.id)}
                onView={() => setPreviewIndex(candidateIndex)}
              />
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          {error ? (
            <Alert variant="destructive" className="mr-auto sm:max-w-sm">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button variant="ghost" onClick={onClose} disabled={importing}>
            取消
          </Button>
          <Button
            onClick={() => onConfirm(Array.from(selectedIds))}
            disabled={selectedIds.size === 0 || importing}
          >
            {importing ? (
              <>
                <Spinner aria-hidden="true" />
                正在导入…
              </>
            ) : (
              `导入所选 ${selectedIds.size} 张`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
      <PhotoPreviewOverlay
        items={previewItems}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewIndex(null)}
      />
    </Dialog>
  )
}
