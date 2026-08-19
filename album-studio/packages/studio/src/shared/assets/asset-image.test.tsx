import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import { AssetImage } from './asset-image'

const beautifyImageSource = vi.hoisted(() => vi.fn())

vi.mock('@/shared/beauty/beautify-image-source', () => ({
  beautifyImageSource
}))

const effects = { beautySmooth: 0, beautyWhiten: 0, clarity: 0.5 }

function platform(): StudioPlatform {
  return {
    assets: {
      // Return the same concrete URL deliberately: the derivative identity must
      // still separate preview and print targets.
      getSource: vi.fn().mockResolvedValue('blob:shared-base'),
      releaseSource: vi.fn()
    }
  } as unknown as StudioPlatform
}

describe('AssetImage derived targets', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    beautifyImageSource.mockReset()
    beautifyImageSource.mockImplementation((_source, _effects, maxEdge) =>
      Promise.resolve(maxEdge === 0 ? 'blob:print-full' : 'blob:preview-2048')
    )
    vi.stubGlobal('URL', {
      ...URL,
      revokeObjectURL: vi.fn()
    })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not reuse a preview 2048 derivative for a full-resolution print image', async () => {
    render(
      <StudioPlatformProvider platform={platform()}>
        <AssetImage
          documentId="document-1"
          assetId="asset-1"
          sourceRequest={{ quality: 'preview', pageWidthRatio: 0.5, pageHeightRatio: 0.4 }}
          beautify={effects}
          beautyMaxEdge={2048}
          alt="preview"
        />
        <AssetImage
          documentId="document-1"
          assetId="asset-1"
          sourceRequest={{ quality: 'print', pageWidthRatio: 0.5, pageHeightRatio: 0.4 }}
          beautify={effects}
          beautyMaxEdge={0}
          alt="print"
        />
      </StudioPlatformProvider>
    )

    await act(async () => undefined)
    await act(async () => vi.advanceTimersByTime(120))

    expect(beautifyImageSource).toHaveBeenCalledTimes(2)
    expect(beautifyImageSource).toHaveBeenCalledWith('blob:shared-base', effects, 2048)
    expect(beautifyImageSource).toHaveBeenCalledWith('blob:shared-base', effects, 0)
    expect(screen.getByAltText('preview')).toHaveAttribute('src', 'blob:preview-2048')
    expect(screen.getByAltText('print')).toHaveAttribute('src', 'blob:print-full')
  })

  it('shares one preview derivative when only non-print placement ratios differ', async () => {
    beautifyImageSource.mockResolvedValue('blob:shared-preview')
    render(
      <StudioPlatformProvider platform={platform()}>
        <AssetImage
          documentId="document-1"
          assetId="asset-1"
          sourceRequest={{ quality: 'preview', pageWidthRatio: 0.25, pageHeightRatio: 0.3 }}
          beautify={effects}
          beautyMaxEdge={2048}
          alt="small placement"
        />
        <AssetImage
          documentId="document-1"
          assetId="asset-1"
          sourceRequest={{ quality: 'preview', pageWidthRatio: 0.8, pageHeightRatio: 0.7 }}
          beautify={effects}
          beautyMaxEdge={2048}
          alt="large placement"
        />
      </StudioPlatformProvider>
    )

    await act(async () => undefined)
    await act(async () => vi.advanceTimersByTime(120))

    expect(beautifyImageSource).toHaveBeenCalledTimes(1)
    expect(screen.getByAltText('small placement')).toHaveAttribute('src', 'blob:shared-preview')
    expect(screen.getByAltText('large placement')).toHaveAttribute('src', 'blob:shared-preview')
  })
})
