import { IMAGE_PIPELINE_VERSION } from '@album-studio/common'
import { net, protocol } from 'electron'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { type ImageVariantRequest } from '../assets/image-store'

export type AssetProtocolVariantRequest =
  | Exclude<ImageVariantRequest, { variant: 'print' }>
  | {
      variant: 'print'
      usage?: { widthFraction: number; heightFraction: number }
    }

type AssetResolver = {
  resolveAsset: (
    projectId: string,
    assetId: string,
    request: AssetProtocolVariantRequest
  ) => Promise<string>
}

type FetchFile = (url: string) => Promise<Response>

export type ParsedAssetProtocolRequest = {
  projectId: string
  assetId: string
  variant: AssetProtocolVariantRequest
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }
  })
}

function parseUsage(url: URL): { widthFraction: number; heightFraction: number } | undefined {
  const widthValue = url.searchParams.get('width')
  const heightValue = url.searchParams.get('height')
  if (widthValue === null && heightValue === null) return undefined
  if (widthValue === null || heightValue === null) throw new Error('打印尺寸参数不完整。')
  const widthFraction = Number(widthValue)
  const heightFraction = Number(heightValue)
  if (
    !Number.isFinite(widthFraction) ||
    !Number.isFinite(heightFraction) ||
    widthFraction <= 0 ||
    heightFraction <= 0 ||
    widthFraction > 1 ||
    heightFraction > 1
  ) {
    throw new Error('打印尺寸参数无效。')
  }
  return { widthFraction, heightFraction }
}

export function parseAssetProtocolRequest(requestUrl: string): ParsedAssetProtocolRequest {
  const url = new URL(requestUrl)
  if (url.protocol !== 'album-asset:' || url.hostname !== 'project') {
    throw new Error('素材地址无效。')
  }
  const encodedSegments = url.pathname.split('/').slice(1)
  if (encodedSegments.length !== 2 || encodedSegments.some((segment) => segment.length === 0)) {
    throw new Error('素材地址路径无效。')
  }
  const [projectId, assetId] = encodedSegments.map((segment) => decodeURIComponent(segment))
  if (!SAFE_ID.test(projectId) || !SAFE_ID.test(assetId)) throw new Error('素材地址 ID 无效。')

  const version = url.searchParams.get('v')
  if (version !== IMAGE_PIPELINE_VERSION) {
    throw new Error('素材缓存版本无效。')
  }
  const quality = url.searchParams.get('quality') ?? 'preview'
  if (quality === 'original') {
    if (url.searchParams.has('width') || url.searchParams.has('height')) {
      throw new Error('原图请求不能包含打印尺寸。')
    }
    return { projectId, assetId, variant: { variant: 'original' } }
  }
  if (quality === 'preview') {
    if (url.searchParams.has('width') || url.searchParams.has('height')) {
      throw new Error('预览图请求不能包含打印尺寸。')
    }
    return { projectId, assetId, variant: { variant: 'preview' } }
  }
  if (quality === 'thumbnail') {
    if (url.searchParams.has('width') || url.searchParams.has('height')) {
      throw new Error('缩略图请求不能包含打印尺寸。')
    }
    return { projectId, assetId, variant: { variant: 'thumbnail' } }
  }
  if (quality === 'print') {
    return {
      projectId,
      assetId,
      variant: { variant: 'print', usage: parseUsage(url) }
    }
  }
  throw new Error('素材清晰度无效。')
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.avif':
      return 'image/avif'
    default:
      return 'image/jpeg'
  }
}

export async function createAssetProtocolResponse(
  requestUrl: string,
  projects: AssetResolver,
  fetchFile: FetchFile
): Promise<Response> {
  try {
    const request = parseAssetProtocolRequest(requestUrl)
    const path = await projects.resolveAsset(request.projectId, request.assetId, request.variant)
    const fileResponse = await fetchFile(pathToFileURL(path).toString())
    if (!fileResponse.ok || !fileResponse.body) return notFound()
    const headers = new Headers(fileResponse.headers)
    headers.set('Cache-Control', IMMUTABLE_CACHE)
    headers.set('Content-Type', contentType(path))
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(fileResponse.body, {
      status: fileResponse.status,
      statusText: fileResponse.statusText,
      headers
    })
  } catch {
    return notFound()
  }
}

export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'album-asset',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true
      }
    }
  ])
}

export function handleAssetProtocol(projects: AssetResolver): void {
  protocol.handle('album-asset', (request) =>
    createAssetProtocolResponse(request.url, projects, (url) => net.fetch(url))
  )
}
