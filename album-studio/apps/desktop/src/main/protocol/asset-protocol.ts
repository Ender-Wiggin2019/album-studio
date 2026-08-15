import { protocol } from 'electron'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { ProjectRepository } from '../projects/project-repository'

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

export function handleAssetProtocol(projects: ProjectRepository): void {
  protocol.handle('album-asset', async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'project') return new Response('Not found', { status: 404 })
    const [projectId, assetId] = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    if (!projectId || !assetId) return new Response('Not found', { status: 404 })
    try {
      const requestedQuality = url.searchParams.get('quality')
      const quality =
        requestedQuality === 'original' || requestedQuality === 'print'
          ? requestedQuality
          : 'preview'
      const path = await projects.resolveAsset(projectId, assetId, quality)
      const extension = extname(path).toLowerCase()
      const contentType =
        extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
      return new Response(new Uint8Array(await readFile(path)), {
        headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=31536000' }
      })
    } catch (error) {
      return new Response(error instanceof Error ? error.message : 'Not found', { status: 404 })
    }
  })
}
