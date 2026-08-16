import { ICON_RESOURCE_IDS, STICKER_RESOURCE_IDS } from '@album-studio/common'
import { SearchIcon, TypeIcon, XIcon } from 'lucide-react'
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { useStudioStore } from '@/app/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDraggableBlockSource } from '@/features/block-placement/draggable-block-source'
import {
  buildAddBlockCommand,
  decorationFromPlacementPayload
} from '@/features/block-placement/drop-coordinate'
import type { BlockPlacementPayload } from '@/features/block-placement/payload'
import { ICON_DECORATION_REGISTRY, STICKER_DECORATION_REGISTRY } from './decoration-registry'

function ComponentSourceButton({
  payload,
  label,
  disabled,
  dragDisabled,
  children,
  onActivate
}: {
  payload: BlockPlacementPayload
  label: string
  disabled: boolean
  dragDisabled: boolean
  children: ReactNode
  onActivate: (payload: BlockPlacementPayload) => void
}): React.JSX.Element {
  const { ref, isDragging } = useDraggableBlockSource(payload, { disabled: dragDisabled })

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={() => onActivate(payload)}
      aria-label={label}
      title={`${label}：点击居中放置，或拖到画布`}
      data-dragging={isDragging || undefined}
      className="group grid min-w-0 cursor-pointer justify-items-center gap-1.5 rounded-lg border bg-card px-2 py-2.5 text-center outline-none transition-colors hover:border-primary/45 hover:bg-accent/45 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[dragging=true]:opacity-55"
    >
      {children}
      <span className="w-full truncate text-[11px] font-medium">{label}</span>
    </button>
  )
}

export function ComponentLibraryPanel(): React.JSX.Element {
  const document = useStudioStore((state) => state.document)
  const selectedPageId = useStudioStore((state) => state.selectedPageId)
  const selectedBlockId = useStudioStore((state) => state.selectedBlockId)
  const dispatch = useStudioStore((state) => state.dispatch)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase('zh-CN')

  const visibleIconIds = useMemo(
    () =>
      ICON_RESOURCE_IDS.filter((resourceId) => {
        const resource = ICON_DECORATION_REGISTRY[resourceId]
        return (
          !normalizedQuery ||
          resource.label.toLocaleLowerCase('zh-CN').includes(normalizedQuery) ||
          resourceId.includes(normalizedQuery)
        )
      }),
    [normalizedQuery]
  )
  const visibleStickerIds = useMemo(
    () =>
      STICKER_RESOURCE_IDS.filter((resourceId) => {
        const resource = STICKER_DECORATION_REGISTRY[resourceId]
        return (
          !normalizedQuery ||
          resource.label.toLocaleLowerCase('zh-CN').includes(normalizedQuery) ||
          resourceId.includes(normalizedQuery)
        )
      }),
    [normalizedQuery]
  )

  const selectedPage = document?.pages.find((page) => page.id === selectedPageId)
  const selectedBlock = selectedPage?.blocks.find((block) => block.id === selectedBlockId)
  const canCreate = Boolean(selectedPage && selectedPage.blocks.length < 100)

  const activatesByReplacement = (payload: BlockPlacementPayload): boolean =>
    (payload.kind === 'icon' || payload.kind === 'sticker') &&
    selectedBlock?.type === 'decoration' &&
    selectedBlock.decoration.kind === payload.kind

  const activate = (payload: BlockPlacementPayload): void => {
    if (!selectedPage) return
    if (activatesByReplacement(payload) && selectedBlock?.type === 'decoration') {
      const iconColor =
        selectedBlock.decoration.kind === 'icon' ? selectedBlock.decoration.color : undefined
      dispatch({
        type: 'replace-decoration',
        pageId: selectedPage.id,
        blockId: selectedBlock.id,
        decoration: decorationFromPlacementPayload(
          payload as Extract<BlockPlacementPayload, { kind: 'icon' | 'sticker' }>,
          iconColor
        )
      })
      return
    }
    if (canCreate) dispatch(buildAddBlockCommand(selectedPage.id, payload))
  }

  const sourceDisabled = (payload: BlockPlacementPayload): boolean =>
    !canCreate && !activatesByReplacement(payload)

  return (
    <section
      className="flex h-full min-h-0 w-[360px] max-w-full flex-col overflow-hidden bg-background"
      aria-label="组件库"
    >
      <div className="shrink-0 border-b p-3">
        <ComponentSourceButton
          payload={{ kind: 'rich-text' }}
          label="添加文字"
          disabled={!canCreate}
          dragDisabled={!canCreate}
          onActivate={activate}
        >
          <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
            <TypeIcon className="size-5" />
          </span>
        </ComponentSourceButton>

        <div className="relative mt-3">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索图标或贴纸"
            aria-label="搜索组件"
            className="h-8 pl-8 pr-8 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="清除组件搜索"
              title="清除搜索"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {visibleIconIds.length ? (
          <section aria-labelledby="component-icons-heading">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 id="component-icons-heading" className="text-xs font-semibold">
                图标
              </h2>
              <span className="text-[10px] text-muted-foreground">{visibleIconIds.length} 个</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {visibleIconIds.map((resourceId) => {
                const resource = ICON_DECORATION_REGISTRY[resourceId]
                const payload = { kind: 'icon', resourceId } as const
                return (
                  <ComponentSourceButton
                    key={resourceId}
                    payload={payload}
                    label={resource.label}
                    disabled={sourceDisabled(payload)}
                    dragDisabled={!canCreate}
                    onActivate={activate}
                  >
                    <resource.Icon className="size-7 text-primary transition-transform group-hover:scale-105" />
                  </ComponentSourceButton>
                )
              })}
            </div>
          </section>
        ) : null}

        {visibleStickerIds.length ? (
          <section
            aria-labelledby="component-stickers-heading"
            className={visibleIconIds.length ? 'mt-5' : undefined}
          >
            <div className="mb-2 flex items-baseline justify-between">
              <h2 id="component-stickers-heading" className="text-xs font-semibold">
                贴纸
              </h2>
              <span className="text-[10px] text-muted-foreground">
                {visibleStickerIds.length} 张
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {visibleStickerIds.map((resourceId) => {
                const resource = STICKER_DECORATION_REGISTRY[resourceId]
                const payload = { kind: 'sticker', resourceId } as const
                return (
                  <ComponentSourceButton
                    key={resourceId}
                    payload={payload}
                    label={resource.label}
                    disabled={sourceDisabled(payload)}
                    dragDisabled={!canCreate}
                    onActivate={activate}
                  >
                    <span className="grid size-10 place-items-center overflow-hidden rounded-md bg-muted/65 p-1">
                      <img
                        src={resource.source}
                        alt=""
                        draggable={false}
                        className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                      />
                    </span>
                  </ComponentSourceButton>
                )
              })}
            </div>
          </section>
        ) : null}

        {visibleIconIds.length === 0 && visibleStickerIds.length === 0 ? (
          <div className="grid min-h-48 place-items-center text-center">
            <div>
              <SearchIcon className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-xs font-medium">没有找到“{deferredQuery}”</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => setQuery('')}>
                清除搜索
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
