import {
  AssetRecordSchema,
  ImportAssetsRequestSchema,
  RelinkAssetRequestSchema,
  type AssetRecord,
  type ImportAssetsResult
} from '@album-studio/common'
import { BrowserWindow, dialog } from 'electron'
import { readdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { imageStore, type ImageStore, type SupportedImageMimeType } from './image-store'
import type { ProjectRepository } from '../projects/project-repository'

const MIME_BY_EXTENSION = new Map<string, SupportedImageMimeType>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.avif', 'image/avif']
])

async function collectImageFiles(directory: string): Promise<string[]> {
  const output: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })
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
  constructor(
    private readonly projects: ProjectRepository,
    private readonly images: ImageStore = imageStore
  ) {}

  async chooseAndImport(window: BrowserWindow, input: unknown): Promise<ImportAssetsResult | null> {
    const request = ImportAssetsRequestSchema.parse(input)
    const selection = await dialog.showOpenDialog(window, {
      title: request.source === 'folder' ? '选择照片文件夹' : '选择照片',
      buttonLabel: '导入照片',
      properties: request.source === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters:
        request.source === 'files'
          ? [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] }]
          : undefined
    })
    if (selection.canceled || selection.filePaths.length === 0) return null

    const files =
      request.source === 'folder'
        ? await collectImageFiles(selection.filePaths[0])
        : selection.filePaths
    return this.importFiles(request.projectPath, files)
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
}
