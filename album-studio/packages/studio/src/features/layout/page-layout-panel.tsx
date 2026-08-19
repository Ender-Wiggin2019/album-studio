import {
  FREE_FORM_LAYOUT_DESCRIPTION,
  FREE_FORM_LAYOUT_ID,
  FREE_FORM_LAYOUT_NAME,
  listPageLayouts,
  type PageLayout,
  type ThemeId
} from '@album-studio/common'
import { ImageIcon, TypeIcon } from 'lucide-react'
import { useStudioStore } from '@/app/store'
import { ThemePreviewCard } from '@/features/theme/theme-preview-card'
import { cn } from '@/shared/lib/cn'

function countSlots(layout: PageLayout, type: 'image' | 'rich-text'): number {
  return layout.slots.filter((slot) => slot.accepts === type).length
}

function LayoutThumbnail({ layout }: { layout: PageLayout }): React.JSX.Element {
  return (
    <span className="relative block size-full overflow-hidden rounded border bg-background">
      {layout.slots.map((slot, index) => (
        <span
          key={`${slot.accepts}-${index}`}
          className={cn(
            'absolute grid place-items-center overflow-hidden rounded-[2px] border',
            slot.accepts === 'image'
              ? 'border-primary/35 bg-primary/18 text-primary'
              : 'border-dashed border-foreground/35 bg-muted text-foreground/65'
          )}
          style={{
            left: `${slot.transform.x * 100}%`,
            top: `${slot.transform.y * 100}%`,
            width: `${slot.transform.width * 100}%`,
            height: `${slot.transform.height * 100}%`
          }}
        >
          {slot.accepts === 'image' ? (
            <ImageIcon className="size-3 max-h-[60%] max-w-[60%]" aria-hidden="true" />
          ) : (
            <TypeIcon className="size-3 max-h-[60%] max-w-[60%]" aria-hidden="true" />
          )}
        </span>
      ))}
    </span>
  )
}

export function PageLayoutPanel(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const dispatch = useStudioStore((state) => state.dispatch)
  if (!document) return <div />
  const page =
    document.pages.find((candidate) => candidate.id === selectedPageId) ?? document.pages[0]
  const imageCount = page.blocks.filter((block) => block.type === 'image').length
  const richTextCount = page.blocks.filter((block) => block.type === 'rich-text').length
  const layouts = listPageLayouts({ pageKind: page.kind })
  const hasLayoutContent = imageCount + richTextCount > 0

  return (
    <div className="grid gap-6 p-4">
      <section className="grid gap-3" aria-labelledby="page-layouts-heading">
        <div>
          <h3 id="page-layouts-heading" className="text-sm font-semibold">
            页面布局
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            当前 {imageCount} 张图片 · {richTextCount} 个文字 Block
          </p>
        </div>
        {!hasLayoutContent ? (
          <div className="rounded-lg border border-dashed bg-muted/35 px-4 py-5 text-center text-xs leading-5 text-muted-foreground">
            先从素材库或组件库添加图片或文字。
          </div>
        ) : (
          <div className="grid gap-2">
            {page.kind === 'content' && imageCount > 0 ? (
              <button
                key={FREE_FORM_LAYOUT_ID}
                type="button"
                aria-pressed={page.layoutId === FREE_FORM_LAYOUT_ID}
                className="grid grid-cols-[88px_1fr] items-center gap-3 rounded-lg border p-2 text-left outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/6"
                onClick={() =>
                  dispatch({
                    type: 'apply-page-layout',
                    pageId: page.id,
                    layoutId: FREE_FORM_LAYOUT_ID
                  })
                }
              >
                <span
                  className="block w-full"
                  style={{
                    aspectRatio: `${document.pageSpec.widthMm} / ${document.pageSpec.heightMm}`
                  }}
                >
                  <span className="relative block size-full overflow-hidden rounded border bg-background">
                    <span className="absolute inset-x-[8%] top-[10%] bottom-[10%] grid place-items-center rounded-[2px] border border-dashed border-primary/50 bg-primary/8 text-primary">
                      <ImageIcon className="size-3 max-h-[60%] max-w-[60%]" aria-hidden="true" />
                    </span>
                  </span>
                </span>
                <span className="min-w-0">
                  <strong className="block text-xs">{FREE_FORM_LAYOUT_NAME}</strong>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                    {imageCount} 图 · {FREE_FORM_LAYOUT_DESCRIPTION}
                  </span>
                </span>
              </button>
            ) : null}
            {layouts.map((layout) => {
              const requiredImages = countSlots(layout, 'image')
              const requiredText = countSlots(layout, 'rich-text')
              const compatible = requiredImages === imageCount && requiredText === richTextCount
              return (
                <button
                  key={layout.id}
                  type="button"
                  disabled={!compatible}
                  aria-pressed={page.layoutId === layout.id}
                  className="grid grid-cols-[88px_1fr] items-center gap-3 rounded-lg border p-2 text-left outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 aria-pressed:border-primary aria-pressed:bg-primary/6"
                  onClick={() =>
                    dispatch({ type: 'apply-page-layout', pageId: page.id, layoutId: layout.id })
                  }
                >
                  <span
                    className="block w-full"
                    style={{
                      aspectRatio: `${document.pageSpec.widthMm} / ${document.pageSpec.heightMm}`
                    }}
                  >
                    <LayoutThumbnail layout={layout} />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-xs">{layout.name}</strong>
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                      {requiredImages} 图 · {requiredText} 文 · {layout.description}
                    </span>
                  </span>
                </button>
              )
            })}
            {layouts.length === 0 && page.kind === 'cover' ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
                封面暂无可应用的页面布局，可直接调整各个 Block。
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="grid gap-3" aria-labelledby="page-size-heading">
        <div>
          <h3 id="page-size-heading" className="text-sm font-semibold">
            成品尺寸
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {document.pageSpec.widthMm} × {document.pageSpec.heightMm} mm · 创建后不可更改
          </p>
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="album-theme-heading">
        <h3 id="album-theme-heading" className="text-sm font-semibold">
          整册主题
        </h3>
        <div role="radiogroup" className="grid gap-2">
          {(['journal', 'postcard', 'film'] as ThemeId[]).map((themeId) => (
            <ThemePreviewCard
              key={themeId}
              themeId={themeId}
              selected={document.themeId === themeId}
              onSelect={() => dispatch({ type: 'set-theme', themeId })}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
