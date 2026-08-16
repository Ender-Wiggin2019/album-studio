import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: { fetch: vi.fn() },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() }
}))

import { createAssetProtocolResponse, parseAssetProtocolRequest } from './asset-protocol'

describe('album-asset protocol', () => {
  it('parses a versioned print request using normalized Block usage', () => {
    expect(
      parseAssetProtocolRequest(
        'album-asset://project/project-1/asset-a?quality=print&width=0.25&height=0.5&v=1'
      )
    ).toEqual({
      projectId: 'project-1',
      assetId: 'asset-a',
      variant: {
        variant: 'print',
        usage: { widthFraction: 0.25, heightFraction: 0.5 }
      }
    })
  })

  it.each([
    'album-asset://other/project-1/asset-a?v=1',
    'album-asset://project/project-1?v=1',
    'album-asset://project/project-1/asset-a/extra?v=1',
    'album-asset://project/project-1/asset%2Fa?v=1',
    'album-asset://project/project-1/asset-a?quality=print&width=0.5&v=1',
    'album-asset://project/project-1/asset-a?quality=print&width=2&height=0.5&v=1',
    'album-asset://project/project-1/asset-a?quality=raw&v=1',
    'album-asset://project/project-1/asset-a',
    'album-asset://project/project-1/asset-a?v=old'
  ])('rejects an invalid or traversal-like URL: %s', (url) => {
    expect(() => parseAssetProtocolRequest(url)).toThrow()
  })

  it('forwards the file body as a stream and applies immutable content headers', async () => {
    let streamStarted = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        streamStarted = true
        controller.enqueue(new TextEncoder().encode('image bytes'))
        controller.close()
      }
    })
    const projects = {
      resolveAsset: vi.fn(async () => '/project/assets/cache/1/hash/preview.webp')
    }
    const fetchFile = vi.fn(
      async () => new Response(body, { status: 200, headers: { 'Content-Length': '11' } })
    )

    const response = await createAssetProtocolResponse(
      'album-asset://project/project-1/asset-a?quality=preview&v=1',
      projects,
      fetchFile
    )

    expect(projects.resolveAsset).toHaveBeenCalledWith('project-1', 'asset-a', {
      variant: 'preview'
    })
    expect(fetchFile).toHaveBeenCalledWith('file:///project/assets/cache/1/hash/preview.webp')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(streamStarted).toBe(true)
    expect(await response.text()).toBe('image bytes')
  })

  it('does not expose resolver errors in protocol responses', async () => {
    const response = await createAssetProtocolResponse(
      'album-asset://project/project-1/asset-a?v=1',
      { resolveAsset: async () => Promise.reject(new Error('/private/path/photo.jpg')) },
      vi.fn()
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('Not found')
  })
})
