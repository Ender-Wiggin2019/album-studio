import type { AlbumDocument, AlbumStudioApi, ImageCrop } from '@album-studio/common'
import type { AssetSourceRequest, RecentStudioProject, StudioPlatform } from '@album-studio/studio'

type OpenedProject = {
  projectPath: string
  document: AlbumDocument
}

type AssetUsage = {
  width?: number
  height?: number
  crop?: ImageCrop
  eraseKey?: string
}

/**
 * Keeps desktop-only filesystem locations out of the shared React app.
 *
 * The main process remains the authority that validates a path. This mapping
 * only turns the stable document id used by Studio into the path required by
 * the existing narrow preload API for the lifetime of this renderer.
 */
export function createDesktopPlatform(api: AlbumStudioApi = window.albumStudio): StudioPlatform {
  const pathsByDocumentId = new Map<string, string>()

  const remember = ({ projectPath, document }: OpenedProject): AlbumDocument => {
    pathsByDocumentId.set(document.id, projectPath)
    return document
  }

  const pathFor = (documentId: string): string => {
    const projectPath = pathsByDocumentId.get(documentId)
    if (!projectPath) throw new Error('相册尚未在当前窗口中打开，请重新打开后再试。')
    return projectPath
  }

  const assetUsage = (request: AssetSourceRequest): AssetUsage | undefined => {
    if (request.quality === 'erased') {
      if (!request.eraseKey) return undefined
      return { eraseKey: request.eraseKey }
    }
    if (request.quality !== 'print') return undefined
    const width = request.pageWidthRatio
    const height = request.pageHeightRatio
    if (width === undefined || height === undefined) return undefined
    return {
      width: clampRatio(width),
      height: clampRatio(height),
      ...(request.crop ? { crop: request.crop } : {})
    }
  }

  return {
    kind: 'desktop',
    capabilities: new Set([
      'folder-import',
      'native-pdf',
      'asset-relink',
      'durable-project-folder',
      'erase-people'
    ]),
    projects: {
      async listRecent(): Promise<RecentStudioProject[]> {
        const recent = await api.projects.listRecent()
        return recent.map(({ path, ...project }) => {
          pathsByDocumentId.set(project.id, path)
          return project
        })
      },
      async create(input) {
        const opened = await api.projects.create(input)
        return opened ? remember(opened) : null
      },
      async chooseAndOpen() {
        const opened = await api.projects.chooseAndOpen()
        return opened ? remember(opened) : null
      },
      async open(documentId) {
        return remember(await api.projects.openPath(pathFor(documentId)))
      },
      async save(document) {
        return api.projects.save({ projectPath: pathFor(document.id), document })
      }
    },
    assets: {
      async pickCandidates(documentId, source) {
        return api.assets.pickCandidates({ projectPath: pathFor(documentId), source })
      },
      async importCandidates(documentId, sessionId, candidateIds) {
        return api.assets.importCandidates({
          projectPath: pathFor(documentId),
          sessionId,
          candidateIds
        })
      },
      async releaseCandidates(sessionId) {
        return api.assets.releaseCandidates({ sessionId })
      },
      async relink(documentId, assetId) {
        return api.assets.relink({ projectPath: pathFor(documentId), assetId })
      },
      async getSource(documentId, assetId, request) {
        return api.assets.url(documentId, assetId, request.quality, assetUsage(request))
      },
      releaseSource() {
        // album-asset: URLs are immutable protocol resources, not object URLs.
      }
    },
    export: {
      async pdf(document) {
        const result = await api.export.pdf({
          projectPath: pathFor(document.id),
          suggestedName: document.title,
          revision: document.revision
        })
        return result ? { displayName: `${document.title}.pdf`, byteSize: result.byteSize } : null
      }
    },
    imageErase: {
      async detect(documentId, assetId) {
        return api.imageErase.detect({ projectPath: pathFor(documentId), assetId })
      },
      async apply(documentId, assetId, erase) {
        return api.imageErase.apply({ projectPath: pathFor(documentId), assetId, erase })
      }
    },
    lifecycle: {
      onCloseRequest: api.system.onCloseRequest,
      closeReady: api.system.closeReady
    }
  }
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0.001
  return Math.min(1, value)
}
