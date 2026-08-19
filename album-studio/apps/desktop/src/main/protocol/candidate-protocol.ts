import { IMAGE_PIPELINE_VERSION } from '@album-studio/common'
import { protocol } from 'electron'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export type CandidatePreviewResolver = {
  resolveCandidatePreview(
    sessionId: string,
    candidateId: string
  ): Promise<{ data: Buffer; contentType: string } | null>
}

export type ParsedCandidateProtocolRequest = {
  sessionId: string
  candidateId: string
}

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

/**
 * 候选照片预览地址：album-candidate://preview/<sessionId>/<candidateId>?v=<version>。
 * 候选会话由 AssetService 持有，只在“选择照片 → 导入所选”期间有效。
 */
export function parseCandidateProtocolRequest(requestUrl: string): ParsedCandidateProtocolRequest {
  const url = new URL(requestUrl)
  if (url.protocol !== 'album-candidate:' || url.hostname !== 'preview') {
    throw new Error('候选照片地址无效。')
  }
  const segments = url.pathname.split('/').slice(1)
  if (segments.length !== 2 || segments.some((segment) => segment.length === 0)) {
    throw new Error('候选照片地址路径无效。')
  }
  const sessionId = decodeURIComponent(segments[0])
  const candidateId = decodeURIComponent(segments[1])
  if (!SAFE_ID.test(sessionId)) throw new Error('候选照片会话 ID 无效。')
  if (!SAFE_ID.test(candidateId)) throw new Error('候选照片 ID 无效。')
  if (url.searchParams.get('v') !== IMAGE_PIPELINE_VERSION) {
    throw new Error('候选照片缓存版本无效。')
  }
  return { sessionId, candidateId }
}

export async function createCandidateProtocolResponse(
  requestUrl: string,
  resolver: CandidatePreviewResolver
): Promise<Response> {
  try {
    const { sessionId, candidateId } = parseCandidateProtocolRequest(requestUrl)
    const preview = await resolver.resolveCandidatePreview(sessionId, candidateId)
    if (!preview) return notFound()
    const buffer = preview.data
    const body = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer
    return new Response(body, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': preview.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch {
    return notFound()
  }
}

export function handleCandidateProtocol(resolver: CandidatePreviewResolver): void {
  protocol.handle('album-candidate', (request) =>
    createCandidateProtocolResponse(request.url, resolver)
  )
}
