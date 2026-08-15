import {
  AssetRecordSchema,
  ImportAssetsRequestSchema,
  RelinkAssetRequestSchema,
  type AssetRecord,
  type ImportAssetsResult
} from '@album-studio/common'
import { BrowserWindow, dialog, nativeImage } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { access, mkdir, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises'
import { basename, extname, join, posix } from 'node:path'
import type { ProjectRepository } from '../projects/project-repository'

const MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp']
] as const)

async function writeOnceAtomically(path: string, bytes: Uint8Array): Promise<void> {
  try {
    await access(path)
    return
  } catch {
    // The content-addressed file does not exist yet.
  }
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  const handle = await open(temporaryPath, 'wx')
  try {
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    await rename(temporaryPath, path)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

function sniffMime(bytes: Buffer): AssetRecord['mimeType'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export async function storeImageBuffer(input: {
  projectRoot: string
  fileName: string
  bytes: Buffer
  expectedMimeType?: AssetRecord['mimeType']
  importedAt?: string
}): Promise<AssetRecord> {
  const mimeType = sniffMime(input.bytes)
  if (!mimeType) throw new Error('无法识别图片格式')
  if (input.expectedMimeType && mimeType !== input.expectedMimeType) {
    throw new Error('文件内容与声明的图片格式不匹配')
  }
  const image = nativeImage.createFromBuffer(input.bytes)
  if (image.isEmpty()) throw new Error('图片内容无法解码')
  const size = image.getSize()
  if (size.width < 1 || size.height < 1) throw new Error('图片尺寸无效')
  const contentHash = createHash('sha256').update(input.bytes).digest('hex')
  const extension = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/png' ? '.png' : '.webp'
  const originals = join(input.projectRoot, 'assets', 'original')
  const previews = join(input.projectRoot, 'assets', 'previews')
  const prints = join(input.projectRoot, 'assets', 'print')
  await mkdir(originals, { recursive: true })
  await mkdir(previews, { recursive: true })
  await mkdir(prints, { recursive: true })
  const originalPath = join(originals, `${contentHash}${extension}`)
  await writeOnceAtomically(originalPath, input.bytes)

  const maxSide = 720
  const ratio = Math.min(1, maxSide / Math.max(size.width, size.height))
  const preview = image.resize({
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio)),
    quality: 'good'
  })
  const previewPath = join(previews, `${contentHash}.jpg`)
  await writeOnceAtomically(previewPath, preview.toJPEG(82))
  const previewRelativePath = posix.join('assets', 'previews', `${contentHash}.jpg`)
  const printMaxSide = 1600
  const printRatio = Math.min(1, printMaxSide / Math.max(size.width, size.height))
  const printImage = image.resize({
    width: Math.max(1, Math.round(size.width * printRatio)),
    height: Math.max(1, Math.round(size.height * printRatio)),
    quality: 'best'
  })
  const printPath = join(prints, `${contentHash}.jpg`)
  await writeOnceAtomically(printPath, printImage.toJPEG(86))
  const printRelativePath = posix.join('assets', 'print', `${contentHash}.jpg`)

  return AssetRecordSchema.parse({
    id: `asset-${contentHash.slice(0, 24)}`,
    fileName: input.fileName,
    contentHash,
    mimeType,
    byteSize: input.bytes.byteLength,
    width: size.width,
    height: size.height,
    originalRelativePath: posix.join('assets', 'original', `${contentHash}${extension}`),
    previewRelativePath,
    printRelativePath,
    importedAt: input.importedAt ?? new Date().toISOString()
  })
}

async function collectImageFiles(directory: string): Promise<string[]> {
  const output: string[] = []
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) output.push(...(await collectImageFiles(path)))
    if (entry.isFile() && MIME_BY_EXTENSION.has(extname(entry.name).toLowerCase() as '.jpg'))
      output.push(path)
  }
  return output.sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
}

export class AssetService {
  constructor(private readonly projects: ProjectRepository) {}

  async chooseAndImport(window: BrowserWindow, input: unknown): Promise<ImportAssetsResult | null> {
    const request = ImportAssetsRequestSchema.parse(input)
    const selection = await dialog.showOpenDialog(window, {
      title: request.source === 'folder' ? '选择照片文件夹' : '选择照片',
      buttonLabel: '导入照片',
      properties: request.source === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
      filters:
        request.source === 'files'
          ? [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
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
      registration.project.assets.map((asset) => [asset.contentHash, asset])
    )
    const imported: AssetRecord[] = []
    const duplicateAssetIds: string[] = []
    const skipped: ImportAssetsResult['skipped'] = []

    for (const sourcePath of files) {
      const fileName = basename(sourcePath)
      try {
        const sourceInfo = await stat(sourcePath)
        if (!sourceInfo.isFile()) throw new Error('不是普通文件')
        const extensionMime = MIME_BY_EXTENSION.get(extname(sourcePath).toLowerCase() as '.jpg')
        if (!extensionMime) throw new Error('仅支持 JPEG、PNG 和 WebP')
        const bytes = await readFile(sourcePath)
        const mimeType = sniffMime(bytes)
        if (!mimeType || mimeType !== extensionMime) throw new Error('文件内容与扩展名不匹配')
        const contentHash = createHash('sha256').update(bytes).digest('hex')
        const duplicate = existingByHash.get(contentHash)
        if (duplicate) {
          duplicateAssetIds.push(duplicate.id)
          continue
        }

        const record = await storeImageBuffer({
          projectRoot: registration.root,
          fileName,
          bytes,
          expectedMimeType: mimeType
        })
        imported.push(record)
        existingByHash.set(contentHash, record)
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
    const expected = registration.project.assets.find((asset) => asset.id === request.assetId)
    if (!expected) throw new Error('要恢复的素材不在当前项目中。')
    const selection = await dialog.showOpenDialog(window, {
      title: `重新定位 ${expected.fileName}`,
      buttonLabel: '恢复这张照片',
      properties: ['openFile'],
      filters: [{ name: '照片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    })
    if (selection.canceled || !selection.filePaths[0]) return null
    const bytes = await readFile(selection.filePaths[0])
    const contentHash = createHash('sha256').update(bytes).digest('hex')
    if (contentHash !== expected.contentHash) {
      throw new Error('所选文件不是原来的照片（内容指纹不一致）。')
    }
    const restored = await storeImageBuffer({
      projectRoot: registration.root,
      fileName: expected.fileName,
      bytes,
      expectedMimeType: expected.mimeType,
      importedAt: expected.importedAt
    })
    const record = AssetRecordSchema.parse({
      ...restored,
      id: expected.id,
      fileName: expected.fileName
    })
    this.projects.addTransientAssets(request.projectPath, [record])
    return record
  }
}
