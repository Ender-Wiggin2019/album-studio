import {
  IMAGE_PIPELINE_VERSION,
  createAlbumDocument,
  pageSpecSizeAtDpi,
  parseAlbumDocument,
  printImageDerivativeSize,
  printImageTargetSize,
  type AlbumDocument,
  type AssetRecord,
  type PageSpec
} from '@album-studio/common'
import type {
  AssetQuality,
  AssetSourceRequest,
  ImportAssetsResult,
  StudioPlatform
} from '@album-studio/studio'
import {
  fileExists,
  getNestedDirectory,
  getProjectDirectory,
  listProjectIds,
  readFile,
  readJson,
  requestPersistentStorage,
  writeFile,
  writeJson
} from './opfs'
import type { WebpDerivativeBounds } from './browser-image-pipeline'

const MANIFEST_FILE = 'manifest.json'
let imagePipelinePromise: Promise<typeof import('./browser-image-pipeline')> | null = null

function loadImagePipeline(): Promise<typeof import('./browser-image-pipeline')> {
  imagePipelinePromise ??= import('./browser-image-pipeline')
  return imagePipelinePromise
}

const SUPPORTED_IMAGE_TYPES = new Set<AssetRecord['mimeType']>([
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/webp'
])

type SourceCacheEntry = { url: string; references: number }
type DerivativeQuality = Exclude<AssetQuality, 'original' | 'erased'>
type BrowserDerivativeBounds = WebpDerivativeBounds & {
  cacheSize?: { width: number; height: number }
}

type BrowserCandidateSession = {
  documentId: string
  files: Map<string, File>
  urls: Map<string, string>
  importing: boolean
}

class TaskPool {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve))
    }
    this.active += 1
    try {
      return await task()
    } finally {
      this.active -= 1
      this.waiting.shift()?.()
    }
  }
}

function selectImageFiles(source: 'files' | 'folder'): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/avif,image/jpeg,image/png,image/webp'
    input.multiple = true
    if (source === 'folder') input.setAttribute('webkitdirectory', '')
    input.hidden = true
    const finish = (files: File[]): void => {
      input.remove()
      resolve(files)
    }
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), {
      once: true
    })
    input.addEventListener('cancel', () => finish([]), { once: true })
    document.body.append(input)
    input.click()
  })
}

function derivativeBounds(
  asset: AssetRecord,
  quality: DerivativeQuality,
  request: AssetSourceRequest,
  pageSpec: PageSpec
): BrowserDerivativeBounds {
  if (quality === 'thumbnail') return { width: 480, height: 480, quality: 0.82 }
  if (quality === 'preview') return { width: 2048, height: 2048, quality: 0.86 }
  const pageTarget = pageSpecSizeAtDpi(pageSpec, 300)
  const usage = {
    widthFraction: request.pageWidthRatio ?? 1,
    heightFraction: request.pageHeightRatio ?? 1
  }
  const target = printImageTargetSize({ pageSpec, dpi: 300, usage })
  const output = printImageDerivativeSize({
    sourceSize: asset,
    pageSpec,
    dpi: 300,
    usage,
    crop: request.crop
  })
  return {
    ...target,
    quality: 0.92,
    fit: 'cover',
    crop: request.crop,
    maximumPixels: pageTarget.width * pageTarget.height,
    cacheSize: output
  }
}

function derivativeName(
  asset: AssetRecord,
  quality: DerivativeQuality,
  bounds: BrowserDerivativeBounds
): string {
  const size = bounds.cacheSize ?? bounds
  const mode = quality === 'print' ? '-cover' : ''
  return `${asset.contentHash}-${quality}${mode}-${size.width}x${size.height}.webp`
}

async function originalFile(documentId: string, asset: AssetRecord): Promise<File> {
  const project = await getProjectDirectory(documentId)
  const originals = await getNestedDirectory(project, ['assets', 'original'])
  const { extensionForMimeType } = await loadImagePipeline()
  return readFile(originals, `${asset.contentHash}.${extensionForMimeType(asset.mimeType)}`)
}

export function createBrowserPlatform(options?: {
  now?: () => string
  selectFiles?: (source: 'files' | 'folder') => Promise<File[]>
}): StudioPlatform {
  const now = options?.now ?? (() => new Date().toISOString())
  const chooseFiles = options?.selectFiles ?? selectImageFiles
  const documents = new Map<string, AlbumDocument>()
  const derivatives = new TaskPool(2)
  const sourcesByKey = new Map<string, SourceCacheEntry>()
  const keysByUrl = new Map<string, string>()
  const candidateSessions = new Map<string, BrowserCandidateSession>()

  const releaseCandidateSession = (sessionId: string): void => {
    const session = candidateSessions.get(sessionId)
    if (!session) return
    for (const url of session.urls.values()) URL.revokeObjectURL(url)
    candidateSessions.delete(sessionId)
  }

  void requestPersistentStorage()

  const load = async (projectId: string): Promise<AlbumDocument> => {
    const cached = documents.get(projectId)
    if (cached) return cached
    const directory = await getProjectDirectory(projectId)
    const document = parseAlbumDocument(await readJson<unknown>(directory, MANIFEST_FILE))
    documents.set(projectId, document)
    return document
  }

  const save = async (document: AlbumDocument): Promise<void> => {
    const directory = await getProjectDirectory(document.id, true)
    await writeJson(directory, MANIFEST_FILE, parseAlbumDocument(document))
    documents.set(document.id, document)
  }

  const ensureDerivative = async (
    documentId: string,
    asset: AssetRecord,
    quality: DerivativeQuality,
    request: AssetSourceRequest,
    pageSpec: PageSpec
  ): Promise<{ file: File; cacheKey: string }> => {
    const bounds = derivativeBounds(asset, quality, request, pageSpec)
    const name = derivativeName(asset, quality, bounds)
    const project = await getProjectDirectory(documentId)
    const cache = await getNestedDirectory(
      project,
      ['cache', IMAGE_PIPELINE_VERSION, quality],
      true
    )
    if (!(await fileExists(cache, name))) {
      await derivatives.run(async () => {
        if (await fileExists(cache, name)) return
        const { createWebpDerivative } = await loadImagePipeline()
        const derivative = await createWebpDerivative(await originalFile(documentId, asset), bounds)
        await writeFile(cache, name, derivative)
      })
    }
    return {
      file: await readFile(cache, name),
      cacheKey: `${documentId}/cache/${IMAGE_PIPELINE_VERSION}/${quality}/${name}`
    }
  }

  const importFilesIntoDocument = async (
    documentId: string,
    files: File[]
  ): Promise<{
    assets: AssetRecord[]
    duplicateAssetIds: string[]
    skipped: ImportAssetsResult['skipped']
  }> => {
    const document = await load(documentId)
    const knownByHash = new Map(document.assets.map((asset) => [asset.contentHash, asset]))
    const assets: AssetRecord[] = []
    const duplicateAssetIds: string[] = []
    const skipped: ImportAssetsResult['skipped'] = []
    const { extensionForMimeType, inspectImage } = await loadImagePipeline()

    for (const file of files) {
      try {
        if (!SUPPORTED_IMAGE_TYPES.has(file.type as AssetRecord['mimeType'])) {
          throw new Error('仅支持 JPEG、PNG、WebP 与 AVIF')
        }
        const metadata = await inspectImage(file)
        const duplicate = knownByHash.get(metadata.contentHash)
        if (duplicate) {
          duplicateAssetIds.push(duplicate.id)
          continue
        }

        const project = await getProjectDirectory(documentId)
        const originals = await getNestedDirectory(project, ['assets', 'original'], true)
        const originalName = `${metadata.contentHash}.${extensionForMimeType(file.type)}`
        if (!(await fileExists(originals, originalName))) {
          await writeFile(originals, originalName, file)
        }

        const asset: AssetRecord = {
          id: crypto.randomUUID(),
          fileName: file.name,
          contentHash: metadata.contentHash,
          mimeType: file.type as AssetRecord['mimeType'],
          byteSize: file.size,
          width: metadata.width,
          height: metadata.height,
          importedAt: now()
        }
        assets.push(asset)
        knownByHash.set(asset.contentHash, asset)
        await Promise.allSettled([
          ensureDerivative(
            documentId,
            asset,
            'thumbnail',
            { quality: 'thumbnail' },
            document.pageSpec
          ),
          ensureDerivative(documentId, asset, 'preview', { quality: 'preview' }, document.pageSpec)
        ])
      } catch (error) {
        skipped.push({
          fileName: file.name,
          reason: error instanceof Error ? error.message : '图片处理失败'
        })
      }
    }

    documents.set(documentId, {
      ...document,
      assets: [...document.assets, ...assets]
    })
    return { assets, duplicateAssetIds, skipped }
  }

  return {
    kind: 'web',
    capabilities: new Set(['folder-import']),
    projects: {
      async listRecent() {
        const documents = await Promise.all(
          (await listProjectIds()).map((projectId) => load(projectId))
        )
        return documents
          .map((value) => ({
            id: value.id,
            title: value.title,
            themeId: value.themeId,
            updatedAt: value.updatedAt,
            missing: false
          }))
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      },
      async create(input) {
        const document = createAlbumDocument({ ...input, now: now() })
        await save(document)
        return document
      },
      async chooseAndOpen() {
        return null
      },
      open: load,
      async save(document) {
        await save(document)
        return { revision: document.revision, savedAt: now() }
      }
    },
    assets: {
      async pickCandidates(documentId, source) {
        const files = await chooseFiles(source)
        if (files.length === 0) return null
        const sessionId = globalThis.crypto.randomUUID()
        const candidateFiles = new Map<string, File>()
        const candidateUrls = new Map<string, string>()
        const candidates = files.map((file) => {
          const id = globalThis.crypto.randomUUID()
          candidateFiles.set(id, file)
          const url = URL.createObjectURL(file)
          candidateUrls.set(id, url)
          return {
            id,
            fileName: file.name,
            byteSize: file.size,
            previewUrl: url
          }
        })
        candidateSessions.set(sessionId, {
          documentId,
          files: candidateFiles,
          urls: candidateUrls,
          importing: false
        })
        return { id: sessionId, candidates }
      },
      async importCandidates(documentId, sessionId, candidateIds) {
        const session = candidateSessions.get(sessionId)
        if (!session) throw new Error('候选照片会话已失效，请重新选择。')
        if (session.documentId !== documentId) {
          throw new Error('候选照片不属于当前项目。')
        }
        if (session.importing) throw new Error('这批候选照片正在导入。')
        const files = candidateIds.map((id) => session.files.get(id))
        if (!files.every((file): file is File => file instanceof File)) {
          throw new Error('候选照片已变更，请重新选择。')
        }
        session.importing = true
        try {
          const result = await importFilesIntoDocument(documentId, files)
          releaseCandidateSession(sessionId)
          return result
        } catch (error) {
          session.importing = false
          throw error
        }
      },
      async releaseCandidates(sessionId) {
        releaseCandidateSession(sessionId)
      },
      async relink() {
        return null
      },
      async getSource(documentId, assetId, request) {
        const document = await load(documentId)
        const asset = document.assets.find((candidate) => candidate.id === assetId)
        if (!asset) throw new Error('找不到图片资源')
        if (request.quality === 'erased') {
          throw new Error('消除人物仅在桌面版可用。')
        }

        let file: File
        let cacheKey: string
        if (request.quality === 'original') {
          file = await originalFile(documentId, asset)
          cacheKey = `${documentId}/original/${asset.contentHash}`
        } else {
          const derivative = await ensureDerivative(
            documentId,
            asset,
            request.quality,
            request,
            document.pageSpec
          )
          file = derivative.file
          cacheKey = derivative.cacheKey
        }

        const cached = sourcesByKey.get(cacheKey)
        if (cached) {
          cached.references += 1
          return cached.url
        }
        const url = URL.createObjectURL(file)
        sourcesByKey.set(cacheKey, { url, references: 1 })
        keysByUrl.set(url, cacheKey)
        return url
      },
      releaseSource(url) {
        const key = keysByUrl.get(url)
        if (!key) return
        const entry = sourcesByKey.get(key)
        if (!entry || --entry.references > 0) return
        URL.revokeObjectURL(entry.url)
        sourcesByKey.delete(key)
        keysByUrl.delete(entry.url)
      }
    },
    export: {
      async pdf(document) {
        window.print()
        return { displayName: `${document.title}.pdf` }
      }
    },
    imageErase: {
      async detect() {
        throw new Error('消除人物仅在桌面版可用。')
      },
      async apply() {
        throw new Error('消除人物仅在桌面版可用。')
      }
    },
    lifecycle: {
      onCloseRequest() {
        return () => undefined
      },
      closeReady() {
        return Promise.resolve()
      }
    }
  }
}
