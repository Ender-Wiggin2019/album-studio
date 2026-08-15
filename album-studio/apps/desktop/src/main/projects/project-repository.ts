import {
  AlbumProjectSchema,
  RecentProjectSchema,
  createEmptyProject,
  type AlbumProject,
  type AssetRecord,
  type OpenProjectResult,
  type RecentProject,
  type SaveProjectResult,
  type ThemeId
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
import { dirname, join, resolve, sep } from 'node:path'

const MANIFEST_NAME = 'manifest.json'
const RECENT_LIMIT = 12

type RegisteredProject = {
  root: string
  project: AlbumProject
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

function isInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent)
  const normalizedChild = resolve(child)
  return (
    normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`)
  )
}

export class ProjectRepository {
  private readonly registered = new Map<string, RegisteredProject>()
  private readonly saveQueues = new Map<string, Promise<SaveProjectResult>>()
  private readonly recentPath = join(app.getPath('userData'), 'recent-projects.json')

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
    input: { title: string; themeId: ThemeId }
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
    await mkdir(join(root, 'assets', 'previews'), { recursive: true })
    await mkdir(join(root, 'assets', 'print'), { recursive: true })
    await mkdir(join(root, 'backups'), { recursive: true })

    const project = createEmptyProject(input)
    await this.writeManifest(root, project)
    return this.register(root, project)
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

  async openImportedProject(projectPath: string): Promise<OpenProjectResult> {
    return this.open(projectPath, { requireRecent: false })
  }

  async finalizeImportedProject(
    stagingRoot: string,
    finalRoot: string,
    projectInput: AlbumProject
  ): Promise<OpenProjectResult> {
    const project = AlbumProjectSchema.parse(projectInput)
    await this.writeManifest(stagingRoot, project)
    await rename(stagingRoot, finalRoot)
    return this.register(finalRoot, project)
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
    const project = AlbumProjectSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')))
    return this.register(root, project)
  }

  async save(projectPath: string, projectInput: AlbumProject): Promise<SaveProjectResult> {
    const project = AlbumProjectSchema.parse(projectInput)
    const registration = this.registered.get(project.id)
    if (!registration || resolve(registration.root) !== resolve(projectPath)) {
      throw new Error('项目未在当前窗口中打开，已拒绝保存。')
    }

    const previous =
      this.saveQueues.get(project.id) ?? Promise.resolve({ revision: 0, savedAt: '' })
    const next = previous
      .catch(() => ({ revision: 0, savedAt: '' }))
      .then(async () => {
        const current = this.registered.get(project.id)
        if (!current) throw new Error('项目已关闭。')
        if (project.revision < current.project.revision) {
          throw new Error('检测到过期的保存请求，磁盘保留了更新版本。')
        }

        const savedAt = new Date().toISOString()
        const toSave = AlbumProjectSchema.parse({ ...project, updatedAt: savedAt })
        if (toSave.revision > current.project.revision) {
          await this.backupManifest(current.root, current.project.revision)
        }
        await this.writeManifest(current.root, toSave)
        this.registered.set(project.id, { root: current.root, project: toSave })
        await this.touchRecent(current.root, toSave)
        return { revision: toSave.revision, savedAt }
      })
    this.saveQueues.set(project.id, next)
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
    const byId = new Map(registration.project.assets.map((asset) => [asset.id, asset]))
    for (const asset of assets) byId.set(asset.id, asset)
    registration.project = { ...registration.project, assets: [...byId.values()] }
  }

  async resolveAsset(
    projectId: string,
    assetId: string,
    quality: 'preview' | 'print' | 'original'
  ): Promise<string> {
    const registration = this.registered.get(projectId)
    if (!registration) throw new Error('项目未打开。')
    const asset = registration.project.assets.find((candidate) => candidate.id === assetId)
    if (!asset) throw new Error('素材不存在。')
    const relativePath =
      quality === 'preview'
        ? (asset.previewRelativePath ?? asset.originalRelativePath)
        : quality === 'print'
          ? (asset.printRelativePath ?? asset.previewRelativePath ?? asset.originalRelativePath)
          : asset.originalRelativePath
    const candidate = resolve(registration.root, relativePath)
    if (!isInside(registration.root, candidate)) throw new Error('素材路径越过项目边界。')
    const resolved = await realpath(candidate)
    if (!isInside(registration.root, resolved)) throw new Error('素材链接越过项目边界。')
    return resolved
  }

  private async register(root: string, project: AlbumProject): Promise<OpenProjectResult> {
    const canonicalRoot = await realpath(root)
    this.registered.set(project.id, { root: canonicalRoot, project })
    await this.touchRecent(canonicalRoot, project)
    return { projectPath: canonicalRoot, project }
  }

  private async writeManifest(root: string, project: AlbumProject): Promise<void> {
    const manifestPath = join(root, MANIFEST_NAME)
    const temporaryPath = join(root, `.${MANIFEST_NAME}.${process.pid}.${Date.now()}.tmp`)
    const handle = await openFile(temporaryPath, 'wx')
    try {
      await handle.writeFile(`${JSON.stringify(project, null, 2)}\n`, 'utf8')
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

  private async touchRecent(root: string, project: AlbumProject): Promise<void> {
    const current = await this.readRecent()
    const next: RecentProject[] = [
      {
        id: project.id,
        title: project.title,
        path: root,
        updatedAt: project.updatedAt,
        themeId: project.themeId,
        missing: false
      },
      ...current.filter((item) => item.id !== project.id && resolve(item.path) !== resolve(root))
    ].slice(0, RECENT_LIMIT)
    await mkdir(dirname(this.recentPath), { recursive: true })
    await writeFile(this.recentPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  }
}
