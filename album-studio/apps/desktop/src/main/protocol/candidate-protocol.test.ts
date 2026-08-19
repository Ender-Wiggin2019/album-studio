import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  protocol: { handle: vi.fn() }
}))

import {
  createCandidateProtocolResponse,
  parseCandidateProtocolRequest
} from './candidate-protocol'

describe('album-candidate protocol', () => {
  it('parses a versioned preview request', () => {
    expect(parseCandidateProtocolRequest('album-candidate://preview/candidate-1?v=1')).toEqual({
      candidateId: 'candidate-1'
    })
  })

  it.each([
    'album-candidate://other/candidate-1?v=1',
    'album-candidate://preview?v=1',
    'album-candidate://preview/a/b?v=1',
    'album-candidate://preview/candidate%2F1?v=1',
    'album-candidate://preview/candidate-1',
    'album-candidate://preview/candidate-1?v=old'
  ])('rejects an invalid candidate URL: %s', (url) => {
    expect(() => parseCandidateProtocolRequest(url)).toThrow()
  })

  it('serves the resolved preview with no-store headers', async () => {
    const resolver = {
      resolveCandidatePreview: vi.fn(async () => ({
        data: Buffer.from('webp bytes'),
        contentType: 'image/webp'
      }))
    }

    const response = await createCandidateProtocolResponse(
      'album-candidate://preview/candidate-1?v=1',
      resolver
    )

    expect(resolver.resolveCandidatePreview).toHaveBeenCalledWith('candidate-1')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('image/webp')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('webp bytes')
  })

  it('returns 404 when the candidate session is gone', async () => {
    const response = await createCandidateProtocolResponse(
      'album-candidate://preview/candidate-1?v=1',
      { resolveCandidatePreview: async () => null }
    )

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('Not found')
  })

  it('does not expose resolver errors in protocol responses', async () => {
    const response = await createCandidateProtocolResponse(
      'album-candidate://preview/candidate-1?v=1',
      { resolveCandidatePreview: async () => Promise.reject(new Error('/private/path/photo.jpg')) }
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})
