import type { DecorationBlock } from '@album-studio/common'
import {
  ICON_DECORATION_REGISTRY,
  STICKER_DECORATION_REGISTRY
} from '@/features/components/decoration-registry'

export function DecorationBlockView({ block }: { block: DecorationBlock }): React.JSX.Element {
  if (block.decoration.kind === 'icon') {
    const resource = ICON_DECORATION_REGISTRY[block.decoration.resourceId]
    const Icon = resource.Icon
    return (
      <div className="album-decoration-block" data-decoration-kind="icon">
        <Icon
          className="album-decoration-icon"
          color={block.decoration.color}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </div>
    )
  }

  const resource = STICKER_DECORATION_REGISTRY[block.decoration.resourceId]
  return (
    <div className="album-decoration-block" data-decoration-kind="sticker">
      <img className="album-decoration-sticker" src={resource.source} alt="" draggable={false} />
    </div>
  )
}
