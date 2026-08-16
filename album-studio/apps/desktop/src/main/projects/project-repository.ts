import {
  RecentProjectSchema,
  createAlbumDocument,
  parseAlbumDocument,
  type AlbumDocument,
  type AssetRecord,
  type CreateProjectRequest,
  type OpenProjectResult,
  type RecentProject,
  type SaveProjectResult
} from '@album-studio/common'
import { app, BrowserWindow, dialog } from 'electron'
import { constants } from 'node:fs'
import {
  access,
  copyFile,
  mkdir,
  open as openFile,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { imageStore, type ImageStore, type ImageVariantRequest } from '../assets/image-store'
import type { AssetProtocolVariantRequest } from '../protocol/asset-protocol'

const MANIFEST_NAME = 'manifest.json'
const RECENT_LIMIT = 12

type RegisteredProject = {
  root: string
  document: AlbumDocument
}

function safeProjectFolderName(title: string): string {
  const sanitized = title
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[. ]+$/g, '')
    .slice(0, 80)
  return `${sanitized || '未命名相册'}.album-project`
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function uniqueProjectRoot(parent: string, title: string): Promise<string> {
  const initial = join(parent, safeProjectFolderName(title))
  if (!(await pathExists(initial))) return initial
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = join(parent, safeProjectFolderName(`${title} ${suffix}`))
    if (!(await pathExists(candidate))) return candidate
  }
  throw new Error('无法为项目找到可用的文件夹名称。')
}

export class ProjectRepository {
  private readonly registered = new Map<string, RegisteredProject>()
  private readonly saveQueues = new Map<string, Promise<SaveProjectResult>>()
  private readonly recentPath: string

  constructor(
    private readonly images: ImageStore = imageStore,
    userDataPath = app.getPath('userData')
  ) {
    this.recentPath = join(userDataPath, 'recent-projects.json')
  }

  async listRecent(): Promise<RecentProject[]> {
    const stored = await this.readRecent()
    return Promise.all(
      stored.map(async (item) => ({
        ...item,
        missing: !(await pathExists(join(item.path, MANIFEST_NAME)))
      }))
    )
  }

  async createWithDialog(
    window: BrowserWindow,
    input: CreateProjectRequest
  ): Promise<OpenProjectResult | null> {
    const selection = await dialog.showOpenDialog(window, {
      title: '选择相册项目保存位置',
      buttonLabel: '在这里创建',
      properties: ['openDirectory', 'createDirectory']
    })
    if (selection.canceled || !selection.filePaths[0]) return null

    const parent = await realpath(selection.filePaths[0])
    const root = await uniqueProjectRoot(parent, input.title)
    await mkdir(join(root, 'assets', 'original'), { recursive: true })
    await mkdir(join(root, 'assets', 'cache'), { recursive: true })
    await mkdir(join(root, 'backups'), { recursive: true })

    const document = createAlbumDocument(input)
    await this.writeManifest(root, document)
    return this.register(root, document)
  }

  async chooseAndOpen(window: BrowserWindow): Promise<OpenProjectResult | null> {
    const selection = await dialog.showOpenDialog(window, {
      title: '打开相册项目',
      buttonLabel: '打开项目',
      properties: ['openDirectory']
    })
    if (selection.canceled || !selection.filePaths[0]) return null
    return this.open(selection.filePaths[0], { requireRecent: false })
  }

  async openRecent(projectPath: string): Promise<OpenProjectResult> {
    return this.open(projectPath, { requireRecent: true })
  }

  private async open(
    projectPath: string,
    options: { requireRecent: boolean }
  ): Promise<OpenProjectResult> {
    if (options.requireRecent) {
      const recent = await this.readRecent()
      if (!recent.some((item) => resolve(item.path) === resolve(projectPath))) {
        throw new Error('该路径不在最近项目中，请使用“打开相册”重新选择。')
      }
    }

    const root = await realpath(projectPath)
    const manifestPath = join(root, MANIFEST_NAME)
    const info = await stat(manifestPath)
    if (!info.isFile()) throw new Error('所选文件夹不是有效的相册项目。')
    const document = parseAlbumDocument(JSON.parse(await readFile(manifestPath, 'utf8')))
    return this.register(root, document)
  }

  async save(projectPath: string, documentInput: AlbumDocument): Promise<SaveProjectResult> {
    const document = parseAlbumDocument(documentInput)
    const registration = this.registered.get(document.id)
    if (!registration || resolve(registration.root) !== resolve(projectPath)) {
      throw new Error('项目未在当前窗口中打开，已拒绝保存。')
    }

    const previous =
      this.saveQueues.get(document.id) ?? Promise.resolve({ revision: 0, savedAt: '' })
    const next = previous
      .catch(() => ({ revision: 0, savedAt: '' }))
      .then(async () => {
        const current = this.registered.get(document.id)
        if (!current) throw new Error('项目已关闭。')
        if (document.revision < current.document.revision) {
          throw new Error('检测到过期的保存请求，磁盘保留了更新版本。')
        }

        const savedAt = new Date().toISOString()
        const toSave = parseAlbumDocument({ ...document, updatedAt: savedAt })
        if (toSave.revision > current.document.revision) {
          await this.backupManifest(current.root, current.document.revision)
        }
        await this.writeManifest(current.root, toSave)
        this.registered.set(document.id, { root: current.root, document: toSave })
        await this.touchRecent(current.root, toSave)
        return { revision: toSave.revision, savedAt }
      })
    this.saveQueues.set(document.id, next)
    return next
  }

  getRegisteredProjectByPath(projectPath: string): RegisteredProject {
    const match = [...this.registered.values()].find(
      (registration) => resolve(registration.root) === resolve(projectPath)
    )
    if (!match) throw new Error('项目未在当前窗口中打开。')
    return match
  }

  addTransientAssets(projectPath: string, assets: AssetRecord[]): void {
    const registration = this.getRegisteredProjectByPath(projectPath)
    const byId = new Map(registration.document.assets.map((asset) => [asset.id, asset]))
    for (const asset of assets) byId.set(asset.id, asset)
    registration.document = { ...registration.document, assets: [...byId.values()] }
  }

  async resolveAsset(
    projectId: string,
    assetId: string,
    request: AssetProtocolVariantRequest
  ): Promise<string> {
    const registration = this.registered.get(projectId)
    if (!registration) throw new Error('项目未打开。')
    const asset = registration.document.assets.find((candidate) => candidate.id === assetId)
    if (!asset) throw new Error('素材不存在。')
    const imageRequest: ImageVariantRequest =
      request.variant === 'print'
        ? { ...request, pageSpec: registration.document.pageSpec }
        : request
    return this.images.resolve(registration.root, asset, imageRequest)
  }

  private async register(root: string, document: AlbumDocument): Promise<OpenProjectResult> {
    const canonicalRoot = await realpath(root)
    this.registered.set(document.id, { root: canonicalRoot, document })
    await this.touchRecent(canonicalRoot, document)
    return { projectPath: canonicalRoot, document }
  }

  private async writeManifest(root: string, document: AlbumDocument): Promise<void> {
    const manifestPath = join(root, MANIFEST_NAME)
    const temporaryPath = join(root, `.${MANIFEST_NAME}.${process.pid}.${Date.now()}.tmp`)
    const handle = await openFile(temporaryPath, 'wx')
    try {
      await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`, 'utf8')
      await handle.sync()
      await handle.close()
      await rename(temporaryPath, manifestPath)
      if (process.platform !== 'win32') {
        const directory = await openFile(root, 'r')
        try {
          await directory.sync()
        } finally {
          await directory.close()
        }
      }
    } catch (error) {
      await handle.close().catch(() => undefined)
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  private async backupManifest(root: string, revision: number): Promise<void> {
    const manifestPath = join(root, MANIFEST_NAME)
    if (!(await pathExists(manifestPath))) return
    const backupDirectory = join(root, 'backups')
    await mkdir(backupDirectory, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await copyFile(manifestPath, join(backupDirectory, `manifest-r${revision}-${stamp}.json`))
    const backupNames = (await readdir(backupDirectory)).filter(
      (name) => name.startsWith('manifest-') && name.endsWith('.json')
    )
    const backups = await Promise.all(
      backupNames.map(async (name) => ({
        name,
        mtimeMs: (await stat(join(backupDirectory, name))).mtimeMs
      }))
    )
    backups.sort((left, right) => left.mtimeMs - right.mtimeMs)
    await Promise.all(
      backups
        .slice(0, Math.max(0, backups.length - 5))
        .map(({ name }) => unlink(join(backupDirectory, name)))
    )
  }

  private async readRecent(): Promise<RecentProject[]> {
    try {
      const parsed = JSON.parse(await readFile(this.recentPath, 'utf8'))
      return RecentProjectSchema.array().parse(parsed).slice(0, RECENT_LIMIT)
    } catch {
      return []
    }
  }

  private async touchRecent(root: string, document: AlbumDocument): Promise<void> {
    const current = await this.readRecent()
    const next: RecentProject[] = [
      {
        id: document.id,
        title: document.title,
        path: root,
        updatedAt: document.updatedAt,
        themeId: document.themeId,
        missing: false
      },
      ...current.filter((item) => item.id !== document.id && resolve(item.path) !== resolve(root))
    ].slice(0, RECENT_LIMIT)
    await mkdir(dirname(this.recentPath), { recursive: true })
    await writeFile(this.recentPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  }
}
