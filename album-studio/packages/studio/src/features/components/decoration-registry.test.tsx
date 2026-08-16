import { ICON_RESOURCE_IDS, STICKER_RESOURCE_IDS } from '@album-studio/common'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ICON_DECORATION_REGISTRY, STICKER_DECORATION_REGISTRY } from './decoration-registry'

describe('decoration registry', () => {
  it('exhaustively maps every stable icon id to an explicit Lucide component', () => {
    expect(Object.keys(ICON_DECORATION_REGISTRY)).toEqual([...ICON_RESOURCE_IDS])

    for (const resourceId of ICON_RESOURCE_IDS) {
      const resource = ICON_DECORATION_REGISTRY[resourceId]
      const { container, unmount } = render(<resource.Icon aria-label={resource.label} />)
      expect(container.querySelector('svg')).toBeInTheDocument()
      unmount()
    }
  })

  it('exhaustively maps every stable sticker id to one bundled SVG', () => {
    expect(Object.keys(STICKER_DECORATION_REGISTRY)).toEqual([...STICKER_RESOURCE_IDS])
    expect(
      new Set(Object.values(STICKER_DECORATION_REGISTRY).map((resource) => resource.source)).size
    ).toBe(STICKER_RESOURCE_IDS.length)

    for (const resourceId of STICKER_RESOURCE_IDS) {
      const resource = STICKER_DECORATION_REGISTRY[resourceId]
      expect(resource.label).not.toHaveLength(0)
      expect(
        resource.source.startsWith('data:image/svg+xml,') || /\.svg(?:\?.*)?$/.test(resource.source)
      ).toBe(true)
    }
  })
})
