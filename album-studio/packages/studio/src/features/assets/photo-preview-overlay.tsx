import { useEffect } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/**
 * 全屏大图预览层：用于在素材库、导入候选等小缩略图场景里放大查看单张照片。
 * - 基于 Radix Dialog 实现，可安全叠加在其它 Radix 模态对话框之上（嵌套模态），
 *   由 Radix 保证 Esc 只关闭最上层、焦点管理和 a11y 隐藏正确。
 * - 左右按钮 / 方向键翻看相邻照片；Esc、右上角或点击背景关闭。
 * - 每项可通过 renderFooter 提供额外操作（如“添加到当前页”）。
 */
export type PhotoPreviewItem = {
  id: string
  label: string
  renderLarge: () => React.JSX.Element
  renderFooter?: () => React.JSX.Element
}

export function PhotoPreviewOverlay({
  items,
  index,
  onIndexChange,
  onClose
}: {
  items: PhotoPreviewItem[]
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
}): React.JSX.Element | null {
  const open = index !== null && index >= 0 && index < items.length
  const current = open ? items[index] : undefined

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1)
      if (event.key === 'ArrowRight' && index < items.length - 1) onIndexChange(index + 1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [index, items.length, onIndexChange, open])

  if (!open || !current) return null

  const previousButton =
    index > 0 ? (
      <Button
        variant="media"
        size="icon"
        className="absolute left-3 top-1/2 size-10 -translate-y-1/2 rounded-full"
        aria-label="上一张"
        title="上一张"
        onClick={() => onIndexChange(index - 1)}
      >
        <ChevronLeftIcon />
      </Button>
    ) : null
  const nextButton =
    index < items.length - 1 ? (
      <Button
        variant="media"
        size="icon"
        className="absolute right-3 top-1/2 size-10 -translate-y-1/2 rounded-full"
        aria-label="下一张"
        title="下一张"
        onClick={() => onIndexChange(index + 1)}
      >
        <ChevronRightIcon />
      </Button>
    ) : null

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent
        variant="fullscreen"
        showCloseButton={false}
        className="z-[60] flex flex-col bg-media-stage text-media-stage-foreground"
      >
        <DialogTitle className="sr-only">查看大图：{current.label}</DialogTitle>
        <div className="flex shrink-0 items-center gap-3 border-b border-media-stage-border px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{current.label}</p>
          <span className="shrink-0 text-xs text-media-stage-muted">
            {index + 1} / {items.length}
          </span>
          <Button
            variant="media"
            size="icon-sm"
            aria-label="关闭大图预览"
            title="关闭"
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-16 py-2"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          {current.renderLarge()}
          {previousButton}
          {nextButton}
        </div>
        {current.renderFooter ? (
          <div className="flex shrink-0 items-center justify-center px-4 py-4">
            {current.renderFooter()}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
