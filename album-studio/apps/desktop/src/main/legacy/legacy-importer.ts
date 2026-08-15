import {
  LegacyCommitRequestSchema,
  buildProjectFromLegacy,
  paginateLegacyItems,
  parseLegacyAlbum,
  type AssetRecord,
  type LegacyAlbum,
  type LegacyInspection,
  type MigrationIssue,
  type OpenProjectResult,
  type ThemeId
} from '@album-studio/common'
import { BrowserWindow, dialog } from 'electron'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, realpath, rm } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { storeImageBuffer } from '../assets/asset-service'
import type { ProjectRepository } from '../projects/project-repository'

type InspectionCache = {
  sourcePath: string
  sourceKind: 'legacy-json' | 'legacy-html'
  sourceHash: string
  inferredTheme?: ThemeId
  legacy: LegacyAlbum
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function parseHtmlEmbeddedAlbum(html: string): { json: string; inferredTheme?: ThemeId } {
  const match = html.match(
    /<script\b(?=[^>]*\bid=["']embeddedAlbumData["'])[^>]*>([\s\S]*?)<\/script>/i
  )
  if (!match) throw new Error('HTML 中没有找到 embeddedAlbumData。')
  const themeMatch = html.match(/<body\b[^>]*\bdata-theme=["'](journal|postcard|film)["']/i)
  const theme = themeMatch?.[1]
  return {
    json: match[1],
    inferredTheme:
      theme === 'journal' || theme === 'postcard' || theme === 'film' ? theme : undefined
  }
}

function parseSourceBytes(
  bytes: Buffer,
  sourceKind: 'legacy-json' | 'legacy-html'
): { legacy: LegacyAlbum; inferredTheme?: ThemeId } {
  const text = bytes.toString('utf8')
  if (sourceKind === 'legacy-json') return { legacy: parseLegacyAlbum(JSON.parse(text)) }
  const embedded = parseHtmlEmbeddedAlbum(text)
  return {
    legacy: parseLegacyAlbum(JSON.parse(embedded.json)),
    inferredTheme: embedded.inferredTheme
  }
}

function safeFolderName(title: string): string {
  const value = title
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  return `${value || '导入的旧相册'}.album-project`
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function uniqueRoot(parent: string, title: string): Promise<string> {
  const first = join(parent, safeFolderName(title))
  if (!(await exists(first))) return first
  for (let index = 2; index < 1000; index += 1) {
    const candidate = join(parent, safeFolderName(`${title} ${index}`))
    if (!(await exists(candidate))) return candidate
  }
  throw new Error('无法为导入项目找到可用的文件夹名称。')
}

function decodeDataUrl(dataUrl: string): {
  bytes: Buffer
  mimeType: AssetRecord['mimeType']
} {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('图片 data URL 缺少数据段')
  const header = dataUrl.slice(0, comma).toLowerCase()
  const mimeType = header.includes('image/jpeg')
    ? 'image/jpeg'
    : header.includes('image/png')
      ? 'image/png'
      : header.includes('image/webp')
        ? 'image/webp'
        : null
  if (!mimeType || !header.endsWith(';base64')) throw new Error('图片格式不受支持')
  const encoded = dataUrl.slice(comma + 1).replace(/\s/g, '')
  if (!encoded || encoded.length % 4 === 1 || !/^[a-z0-9+/]*={0,2}$/i.test(encoded)) {
    throw new Error('Base64 图片数据损坏')
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length === 0) throw new Error('图片数据为空')
  return { bytes, mimeType }
}

export class LegacyAlbumImporter {
  private readonly inspections = new Map<string, InspectionCache>()

  constructor(private readonly projects: ProjectRepository) {}

  async chooseAndInspect(window: BrowserWindow): Promise<LegacyInspection | null> {
    const selection = await dialog.showOpenDialog(window, {
      title: '导入旧相册',
      buttonLabel: '检查旧相册',
      properties: ['openFile'],
      filters: [{ name: '旧相册', extensions: ['json', 'html', 'htm'] }]
    })
    if (selection.canceled || !selection.filePaths[0]) return null
    const sourcePath = selection.filePaths[0]
    const extension = extname(sourcePath).toLowerCase()
    const sourceKind = extension === '.json' ? 'legacy-json' : 'legacy-html'
    const bytes = await readFile(sourcePath)
    const sourceHash = createHash('sha256').update(bytes).digest('hex')
    const { legacy, inferredTheme } = parseSourceBytes(bytes, sourceKind)
    const issues: MigrationIssue[] = []
    if (!legacy.theme && inferredTheme) {
      issues.push({
        code: 'LEGACY_THEME_INFERRED_FROM_HTML',
        severity: 'info',
        message: '主题由旧 HTML 的 body 属性推断。'
      })
    } else if (!legacy.theme) {
      issues.push({
        code: 'LEGACY_THEME_DEFAULTED',
        severity: 'info',
        message: '旧相册没有保存主题，导入时将使用“旅途手账”。'
      })
    }
    const pages = paginateLegacyItems({
      items: legacy.items,
      defaultPageSize: legacy.pageSize,
      photoPageSizes: legacy.photoPageSizes
    })
    const inspectionId = randomUUID()
    this.inspections.set(inspectionId, {
      sourcePath,
      sourceKind,
      sourceHash,
      inferredTheme,
      legacy
    })
    return {
      inspectionId,
      sourceName: basename(sourcePath),
      sourceKind,
      schemaVersion: legacy.schemaVersion,
      title: legacy.title?.trim() || '导入的旧相册',
      placementCount: legacy.items.length,
      estimatedPageCount: pages.length + 1,
      issues
    }
  }

  async commit(window: BrowserWindow, requestInput: unknown): Promise<OpenProjectResult | null> {
    const request = LegacyCommitRequestSchema.parse(requestInput)
    const cached = this.inspections.get(request.inspectionId)
    if (!cached) throw new Error('迁移检查已失效，请重新选择旧相册。')
    const destination = await dialog.showOpenDialog(window, {
      title: '选择迁移后项目的保存位置',
      buttonLabel: '导入到这里',
      properties: ['openDirectory', 'createDirectory']
    })
    if (destination.canceled || !destination.filePaths[0]) return null

    const sourceHash = await hashFile(cached.sourcePath)
    if (sourceHash !== cached.sourceHash) throw new Error('源文件在检查后发生变化，请重新检查。')
    const legacy: LegacyAlbum = {
      ...cached.legacy,
      theme: cached.legacy.theme ?? cached.inferredTheme ?? request.themeFallback
    }
    const parent = await realpath(resolve(destination.filePaths[0]))
    const finalRoot = await uniqueRoot(parent, legacy.title || '导入的旧相册')
    const stagingRoot = join(parent, `.${basename(finalRoot)}.importing-${randomUUID()}`)
    const importedAt = new Date().toISOString()
    const issues: MigrationIssue[] = []
    const assetsByHash = new Map<string, AssetRecord>()
    const bindings: Array<{ assetId: string | null }> = []

    await mkdir(stagingRoot, { recursive: false })
    try {
      for (const [itemIndex, item] of legacy.items.entries()) {
        const dataUrl = item.dataUrl || item.src || ''
        if (!dataUrl) {
          bindings.push({ assetId: null })
          continue
        }
        try {
          const decoded = decodeDataUrl(dataUrl)
          const record = await storeImageBuffer({
            projectRoot: stagingRoot,
            fileName: item.fileName || `旧照片-${itemIndex + 1}.jpg`,
            bytes: decoded.bytes,
            expectedMimeType: decoded.mimeType,
            importedAt
          })
          const existing = assetsByHash.get(record.contentHash)
          const asset = existing ?? record
          assetsByHash.set(asset.contentHash, asset)
          bindings.push({ assetId: asset.id })
        } catch (error) {
          issues.push({
            code: 'LEGACY_ASSET_UNREADABLE',
            severity: 'warning',
            message: `${item.fileName || `第 ${itemIndex + 1} 项`} 无法解码，已保留空位：${
              error instanceof Error ? error.message : '未知错误'
            }`,
            itemIndex
          })
          bindings.push({ assetId: null })
        }
        item.dataUrl = ''
        item.src = ''
      }

      const project = buildProjectFromLegacy({
        legacy,
        assets: [...assetsByHash.values()],
        bindings,
        sourceKind: cached.sourceKind,
        sourceSha256: sourceHash,
        importedAt,
        initialIssues: issues
      })
      const result = await this.projects.finalizeImportedProject(stagingRoot, finalRoot, project)
      this.inspections.delete(request.inspectionId)
      return result
    } catch (error) {
      this.inspections.delete(request.inspectionId)
      await rm(stagingRoot, { recursive: true, force: true })
      throw error
    }
  }
}
