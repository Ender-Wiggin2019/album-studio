import {
  AssetRecordSchema,
  ImportCandidatesRequestSchema,
  PickImportCandidatesRequestSchema,
  RelinkAssetRequestSchema,
  ReleaseCandidatesRequestSchema,
  type AssetRecord,
  type ImportAssetsResult,
  type ImportCandidate
} from '@album-studio/common'
import { IMAGE_PIPELINE_VERSION } from '@album-studio/common'
import { app, BrowserWindow, dialog } from 'electron'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import sharp from 'sharp'
import { imageStore, MAX_INPUT_PIXELS, type ImageStore, type SupportedImageMimeType } from './image-store'
import type { ProjectRepository } from '../projects/project-repository'

const MIME_BY_EXTENSION = new Map<string, SupportedImageMimeType>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif']
])

const LAST_IMPORT_FOLDER_FILE = 'last-import-folder.json'

async function collectImageFiles(directory: string): Promise<string[]> {
  const output: string[] = []
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EPERM' || code === 'EACCES') return output
    throw error
  }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...(await collectImageFiles(path)))
    if (entry.isFile() && MIME_BY_EXTENSION.has(extname(entry.name).toLowerCase())) {
      output.push(path)
    }
  }
  return output.sort((left, right) => left.localeCompare(right, 'zh-CN', { numeric: true }))
}

export class AssetService {
  private readonly candidatePaths = new Map<string, string>()
  private readonly candidateThumbs = new Map<string, { data: Buffer; contentType: string }>()
  private readonly lastImportFolderPath: string

  constructor(
    private readonly projects: ProjectRepository,
    private readonly images: ImageStore = imageStore,
    userDataPath = app.getPath('userData')
  ) {
    this.lastImportFolderPath = join(userDataPath, LAST_IMPORT_FOLDER_FILE)
  }

  async chooseCandidates(
    window: BrowserWindow,
    input: unknown
  ): Promise<ImportCandidate[] | null> {
    const request = PickImportCandidatesRequestSchema.parse(input)
    const selection = await dialog.showOpenDialog(window, {
      title: request.source === 'folder' ? '选择照片文件夹' : '选择照片',
      buttonLabel: '选择照片',
      defaultPath: await this.lastImportFolder(),
      properties: request.source === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters:
        request.source === 'files'
          ? [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] }]
          : undefined
    })
    if (selection.canceled || selection.filePaths.length === 0) return null
    await this.rememberImportFolder(
      request.source === 'folder'
        ? selection.filePaths[0]
        : dirname(selection.filePaths[0])
    )

    const files =
      request.source === 'folder'
        ? await collectImageFiles(selection.filePaths[0])
        : selection.filePaths
    this.candidatePaths.clear()
    this.candidateThumbs.clear()
    const candidates: ImportCandidate[] = []
    for (const [index, sourcePath] of files.entries()) {
      const id = `candidate-${index + 1}`
      this.candidatePaths.set(id, sourcePath)
      let byteSize = 0
      let width: number | undefined
      let height: number | undefined
      try {
        byteSize = (await stat(sourcePath)).size
        const metadata = await sharp(sourcePath, {
          failOn: 'error',
          limitInputPixels: MAX_INPUT_PIXELS,
          sequentialRead: true
        }).metadata()
        width = metadata.autoOrient?.width ?? metadata.width
        height = metadata.autoOrient?.height ?? metadata.height
      } catch {
        // 预览与导入阶段会逐文件报告失败原因，这里保留空元数据即可。
      }
      candidates.push({
        id,
        fileName: basename(sourcePath),
        byteSize,
        width,
        height,
        previewUrl: `album-candidate://preview/${id}?v=${IMAGE_PIPELINE_VERSION}`
      })
    }
    return candidates
  }

  async importCandidates(input: unknown): Promise<ImportAssetsResult | null> {
    const request = ImportCandidatesRequestSchema.parse(input)
    const files = request.candidateIds
      .map((id) => this.candidatePaths.get(id))
      .filter((path): path is string => Boolean(path))
    if (files.length === 0) return null
    const result = await this.importFiles(request.projectPath, files)
    this.candidatePaths.clear()
    this.candidateThumbs.clear()
    return result
  }

  async releaseCandidates(input: unknown): Promise<void> {
    const request = ReleaseCandidatesRequestSchema.parse(input)
    for (const id of request.candidateIds) {
      this.candidatePaths.delete(id)
      this.candidateThumbs.delete(id)
    }
  }

  async resolveCandidatePreview(
    candidateId: string
  ): Promise<{ data: Buffer; contentType: string } | null> {
    const cached = this.candidateThumbs.get(candidateId)
    if (cached) return cached
    const sourcePath = this.candidatePaths.get(candidateId)
    if (!sourcePath) return null
    try {
      const data = await sharp(sourcePath, {
        failOn: 'error',
        limitInputPixels: MAX_INPUT_PIXELS,
        sequentialRead: true
      })
        .autoOrient()
        .resize({ width: 480, height: 480, fit: 'inside' })
        .webp({ quality: 76, effort: 4 })
        .toBuffer()
      const preview = { data, contentType: 'image/webp' }
      this.candidateThumbs.set(candidateId, preview)
      return preview
    } catch {
      return null
    }
  }

  async importFiles(projectPath: string, files: string[]): Promise<ImportAssetsResult> {
    const registration = this.projects.getRegisteredProjectByPath(projectPath)
    const existingByHash = new Map(
      registration.document.assets.map((asset) => [asset.contentHash, asset])
    )
    const imported: AssetRecord[] = []
    const duplicateAssetIds: string[] = []
    const skipped: ImportAssetsResult['skipped'] = []

    for (const sourcePath of files) {
      const fileName = basename(sourcePath)
      try {
        const expectedMimeType = MIME_BY_EXTENSION.get(extname(sourcePath).toLowerCase())
        if (!expectedMimeType) throw new Error('仅支持 JPEG、PNG、WebP 和 AVIF 图片。')
        const stored = await this.images.importFile(registration.root, sourcePath, {
          mimeType: expectedMimeType
        })
        const duplicate = existingByHash.get(stored.contentHash)
        if (duplicate) {
          duplicateAssetIds.push(duplicate.id)
          continue
        }

        const record = AssetRecordSchema.parse({
          id: `asset-${stored.contentHash}`,
          fileName,
          contentHash: stored.contentHash,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          width: stored.width,
          height: stored.height,
          importedAt: new Date().toISOString()
        })
        await this.images.resolve(registration.root, record, { variant: 'preview' })
        imported.push(record)
        existingByHash.set(record.contentHash, record)
      } catch (error) {
        skipped.push({
          fileName,
          reason: error instanceof Error ? error.message : '无法读取图片'
        })
      }
    }

    this.projects.addTransientAssets(projectPath, imported)
    return { assets: imported, duplicateAssetIds, skipped }
  }

  async chooseAndRelink(window: BrowserWindow, input: unknown): Promise<AssetRecord | null> {
    const request = RelinkAssetRequestSchema.parse(input)
    const registration = this.projects.getRegisteredProjectByPath(request.projectPath)
    const expected = registration.document.assets.find((asset) => asset.id === request.assetId)
    if (!expected) throw new Error('要恢复的素材不在当前项目中。')
    const selection = await dialog.showOpenDialog(window, {
      title: `重新定位 ${expected.fileName}`,
      buttonLabel: '恢复这张照片',
      properties: ['openFile'],
      filters: [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] }]
    })
    if (selection.canceled || !selection.filePaths[0]) return null

    const restored = await this.images.importFile(registration.root, selection.filePaths[0], {
      contentHash: expected.contentHash,
      mimeType: expected.mimeType
    })
    const record = AssetRecordSchema.parse({
      ...expected,
      byteSize: restored.byteSize,
      width: restored.width,
      height: restored.height
    })
    await this.images.resolve(registration.root, record, { variant: 'preview' })
    this.projects.addTransientAssets(request.projectPath, [record])
    return record
  }

  /** 上次成功选择照片的文件夹；不存在或已被删除时不返回，交给系统默认位置。 */
  private async lastImportFolder(): Promise<string | undefined> {
    try {
      const stored = JSON.parse(await readFile(this.lastImportFolderPath, 'utf8')) as {
        path?: unknown
      }
      const candidate = typeof stored?.path === 'string' ? stored.path : undefined
      if (!candidate) return undefined
      const info = await stat(candidate)
      return info.isDirectory() ? candidate : undefined
    } catch {
      return undefined
    }
  }

  /** 记住本次选择的文件夹，失败不阻断导入。 */
  private async rememberImportFolder(folder: string): Promise<void> {
    try {
      await mkdir(dirname(this.lastImportFolderPath), { recursive: true })
      await writeFile(
        this.lastImportFolderPath,
        `${JSON.stringify({ path: folder }, null, 2)}\n`,
        'utf8'
      )
    } catch {
      // 记住上次文件夹失败不应阻断导入。
    }
  }
}
