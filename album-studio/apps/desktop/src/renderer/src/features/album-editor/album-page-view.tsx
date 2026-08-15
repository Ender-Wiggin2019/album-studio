import type { AlbumPage, AlbumProject, PhotoSlot, TextStyle } from '@album-studio/common'
import { ImageOffIcon } from 'lucide-react'
import { useStudioStore } from '@/app/store'
import { cn } from '@/lib/utils'

function fontFamily(style: TextStyle): string {
  if (style.fontFamily === 'sans') return "'Noto Sans SC', sans-serif"
  if (style.fontFamily === 'handwritten') return "'LXGW WenKai', 'Kaiti SC', cursive"
  if (style.fontFamily === 'mono') return 'ui-monospace, monospace'
  return "'Noto Serif SC', 'Songti SC', serif"
}

function textStyle(style: TextStyle): React.CSSProperties {
  return {
    fontFamily: fontFamily(style),
    fontSize: `${style.fontSize / 11.22}cqw`,
    color: style.color,
    textAlign: style.align,
    fontWeight: style.weight,
    lineHeight: style.lineHeight
  }
}

function PhotoSlotView({
  slot,
  project,
  selected,
  interactive,
  assetQuality,
  reportMissing,
  onSelect
}: {
  slot: PhotoSlot
  project: AlbumProject
  selected: boolean
  interactive: boolean
  assetQuality: 'preview' | 'print' | 'original'
  reportMissing: boolean
  onSelect?: () => void
}): React.JSX.Element {
  const asset = project.assets.find((candidate) => candidate.id === slot.assetId)
  const missing = useStudioStore((state) =>
    asset ? state.missingAssetIds.includes(asset.id) : false
  )
  const markAssetMissing = useStudioStore((state) => state.markAssetMissing)
  const markAssetAvailable = useStudioStore((state) => state.markAssetAvailable)
  const media = slot.media
  const hasFilters =
    slot.filters.brightness !== 1 || slot.filters.contrast !== 1 || slot.filters.saturation !== 1
  const imageStyle: React.CSSProperties = {
    objectFit: media.fit,
    filter: hasFilters
      ? `brightness(${slot.filters.brightness}) contrast(${slot.filters.contrast}) saturate(${slot.filters.saturation})`
      : undefined,
    transform: `translate(${media.crop.x}%, ${media.crop.y}%) scale(${media.scale}) rotate(${media.rotationDeg}deg) scaleX(${media.flipX ? -1 : 1}) scaleY(${media.flipY ? -1 : 1})`
  }
  const captionStyle = textStyle(slot.caption.style)
  return (
    <button
      type="button"
      className="photo-slot border-0 bg-transparent p-0 text-left"
      style={{
        left: `${slot.frame.x * 100}%`,
        top: `${slot.frame.y * 100}%`,
        width: `${slot.frame.width * 100}%`,
        height: `${slot.frame.height * 100}%`
      }}
      data-selected={selected}
      data-empty={!asset}
      onClick={(event) => {
        event.stopPropagation()
        if (interactive) onSelect?.()
      }}
      aria-label={asset ? `编辑照片 ${asset.fileName}` : '空照片位'}
      tabIndex={interactive ? 0 : -1}
    >
      <div className={cn('photo-viewport', `mask-${slot.maskId}`)}>
        {asset && !missing ? (
          <img
            src={window.albumStudio.assets.url(project.id, asset.id, assetQuality)}
            alt={slot.caption.text || asset.fileName}
            style={imageStyle}
            draggable={false}
            onError={() => reportMissing && markAssetMissing(asset.id)}
            onLoad={() => markAssetAvailable(asset.id)}
          />
        ) : (
          <div className="missing-photo">
            <span>
              <ImageOffIcon className="mx-auto mb-2 size-5" />
              {asset ? `${asset.fileName} · 文件缺失` : '空照片位'}
            </span>
          </div>
        )}
        {slot.caption.enabled && slot.caption.text ? (
          <div className="slot-caption" style={captionStyle}>
            {slot.caption.text}
          </div>
        ) : null}
      </div>
    </button>
  )
}

export function AlbumPageView({
  project,
  page,
  selectedSlotId,
  interactive = false,
  showSafeArea = false,
  assetQuality = 'preview',
  reportMissing,
  onSelectSlot
}: {
  project: AlbumProject
  page: AlbumPage
  selectedSlotId?: string | null
  interactive?: boolean
  showSafeArea?: boolean
  assetQuality?: 'preview' | 'print' | 'original'
  reportMissing?: boolean
  onSelectSlot?: (slotId: string) => void
}): React.JSX.Element {
  const hero =
    page.kind === 'cover' ? project.assets.find((asset) => asset.id === page.heroAssetId) : null
  const heroMissing = useStudioStore((state) =>
    hero ? state.missingAssetIds.includes(hero.id) : false
  )
  const markAssetMissing = useStudioStore((state) => state.markAssetMissing)
  const markAssetAvailable = useStudioStore((state) => state.markAssetAvailable)
  const shouldReportMissing = reportMissing ?? interactive
  return (
    <div className="album-document" data-album-theme={project.themeId}>
      <div className="album-page" data-page-kind={page.kind}>
        {page.kind === 'cover' ? (
          <>
            {hero && !heroMissing ? (
              <div className="absolute inset-0 overflow-hidden">
                <img
                  className="size-full object-cover"
                  src={window.albumStudio.assets.url(project.id, hero.id, assetQuality)}
                  alt="封面照片"
                  style={{ filter: 'saturate(.9) contrast(.96)' }}
                  onError={() => shouldReportMissing && markAssetMissing(hero.id)}
                  onLoad={() => markAssetAvailable(hero.id)}
                />
                <div className="absolute inset-0 bg-black/10" />
              </div>
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(135deg, var(--album-page-alt), var(--album-page))'
                }}
              />
            )}
            <div className="cover-copy">
              {page.dateLabel ? <p className="cover-date">{page.dateLabel}</p> : null}
              <h1>{page.title}</h1>
              {page.subtitle ? <p>{page.subtitle}</p> : null}
            </div>
          </>
        ) : (
          <>
            {page.slots.map((slot) => (
              <PhotoSlotView
                key={slot.id}
                slot={slot}
                project={project}
                selected={slot.id === selectedSlotId}
                interactive={interactive}
                assetQuality={assetQuality}
                reportMissing={shouldReportMissing}
                onSelect={() => onSelectSlot?.(slot.id)}
              />
            ))}
            {page.note.enabled && page.note.text ? (
              <div className="page-note" style={textStyle(page.note.style)}>
                {page.note.text}
              </div>
            ) : null}
          </>
        )}
        {showSafeArea ? <div className="album-safe-area" aria-hidden="true" /> : null}
      </div>
    </div>
  )
}

export function PrintBook({ project }: { project: AlbumProject }): React.JSX.Element {
  return (
    <div className="print-book" data-print-book>
      {project.pages.map((page) => (
        <div className="print-page" key={page.id}>
          <AlbumPageView project={project} page={page} assetQuality="print" />
        </div>
      ))}
    </div>
  )
}
