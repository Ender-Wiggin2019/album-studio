import type { ThemeId } from '@album-studio/common'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

const themeContent: Record<ThemeId, { name: string; description: string; swatches: string[] }> = {
  journal: {
    name: '旅途手账',
    description: '装订留白、纸纹与行程批注',
    swatches: ['#FFF8EC', '#A84835', '#2E6F6C']
  },
  postcard: {
    name: '海风明信片',
    description: '地址线、邮戳与清爽留白',
    swatches: ['#FFFDF7', '#E9654C', '#127C8A']
  },
  film: {
    name: '胶片画廊',
    description: '片框、边码与接触印样编号',
    swatches: ['#20211D', '#C94B38', '#9CB57B']
  }
}

export function ThemePreviewCard({
  themeId,
  selected,
  onSelect
}: {
  themeId: ThemeId
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  const theme = themeContent[themeId]
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group relative grid w-full gap-3 rounded-lg border bg-card p-3 text-left outline-none transition-colors hover:border-primary/55 focus-visible:ring-2 focus-visible:ring-ring',
        selected && 'border-primary ring-1 ring-primary/25'
      )}
    >
      <div className="flex h-16 overflow-hidden rounded-md border">
        <div className="w-[58%]" style={{ background: theme.swatches[0] }} />
        <div className="grid flex-1 grid-rows-2">
          <div style={{ background: theme.swatches[1] }} />
          <div style={{ background: theme.swatches[2] }} />
        </div>
      </div>
      <span className="grid gap-0.5">
        <span className="text-sm font-semibold">{theme.name}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{theme.description}</span>
      </span>
      {selected ? (
        <span className="absolute right-5 top-5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
          <CheckIcon className="size-4" />
        </span>
      ) : null}
    </button>
  )
}
