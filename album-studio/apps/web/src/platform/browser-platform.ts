import {
  IMAGE_PIPELINE_VERSION,
  createAlbumDocument,
  pageSpecSizeAtDpi,
  parseAlbumDocument,
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
  quality: Exclude<AssetQuality, 'original'>,
  request: AssetSourceRequest,
  pageSpec: PageSpec
): { width: number; height: number; quality: number } {
  if (quality === 'thumbnail') return { width: 480, height: 480, quality: 0.82 }
  if (quality === 'preview') return { width: 2048, height: 2048, quality: 0.86 }
  const pageTarget = pageSpecSizeAtDpi(pageSpec, 300)
  return {
    width: Math.min(
      pageTarget.width,
      Math.max(1, Math.round(pageTarget.width * (request.pageWidthRatio ?? 1)))
    ),
    height: Math.min(
      pageTarget.height,
      Math.max(1, Math.round(pageTarget.height * (request.pageHeightRatio ?? 1)))
    ),
    quality: 0.92
  }
}

function derivativeName(
  asset: AssetRecord,
  quality: Exclude<AssetQuality, 'original'>,
  bounds: { width: number; height: number }
): string {
  return `${asset.contentHash}-${quality}-${bounds.width}x${bounds.height}.webp`
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
  const candidateFiles = new Map<string, File>()
  const candidateUrls = new Map<string, string>()

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
    quality: Exclude<AssetQuality, 'original'>,
    request: AssetSourceRequest,
    pageSpec: PageSpec
  ): Promise<{ file: File; cacheKey: string }> => {
    const bounds = derivativeBounds(quality, request, pageSpec)
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
          ensureDerivative(
            documentId,
            asset,
            'preview',
            { quality: 'preview' },
            document.pageSpec
          )
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
        for (const url of candidateUrls.values()) URL.revokeObjectURL(url)
        candidateFiles.clear()
        candidateUrls.clear()
        return files.map((file, index) => {
          const id = `candidate-${index + 1}`
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
      },
      async importCandidates(documentId, candidateIds) {
        const files = candidateIds
          .map((id) => candidateFiles.get(id))
          .filter((file): file is File => Boolean(file))
        if (files.length === 0) return null
        const result = await importFilesIntoDocument(documentId, files)
        for (const id of candidateIds) {
          const url = candidateUrls.get(id)
          if (url) URL.revokeObjectURL(url)
          candidateFiles.delete(id)
          candidateUrls.delete(id)
        }
        return result
      },
      releaseCandidates(candidateIds) {
        for (const id of candidateIds) {
          const url = candidateUrls.get(id)
          if (url) URL.revokeObjectURL(url)
          candidateFiles.delete(id)
          candidateUrls.delete(id)
        }
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
