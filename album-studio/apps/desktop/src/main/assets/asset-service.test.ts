import { createAlbumDocument } from '@album-studio/common'
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  app: { getPath: () => tmpdir() },
  dialog: { showOpenDialog: vi.fn() }
}))

import { dialog } from 'electron'
import { AssetService } from './asset-service'
import { ImageStore } from './image-store'
import type { ProjectRepository } from '../projects/project-repository'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

async function fixture(): Promise<{
  root: string
  projectRoot: string
  sourcePath: string
  userData: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'album-asset-service-'))
  temporaryRoots.push(root)
  const projectRoot = join(root, 'project')
  const sourcePath = join(root, 'photo.png')
  const userData = join(root, 'user-data')
  await mkdir(projectRoot)
  await sharp({
    create: { width: 96, height: 64, channels: 3, background: { r: 70, g: 140, b: 210 } }
  })
    .png()
    .toFile(sourcePath)
  return { root, projectRoot, sourcePath, userData }
}

function projectStub(projectRoot: string): {
  projects: ProjectRepository
  addTransientAssets: ReturnType<typeof vi.fn>
} {
  let nextId = 0
  const registration = {
    root: projectRoot,
    document: createAlbumDocument({ title: '素材测试' }, () => `document-${++nextId}`)
  }
  const addTransientAssets = vi.fn((_path, assets) => {
    registration.document = { ...registration.document, assets }
  })
  return {
    projects: {
      getRegisteredProjectByPath: () => registration,
      addTransientAssets
    } as unknown as ProjectRepository,
    addTransientAssets
  }
}

function makeService(projects: ProjectRepository, userData: string): AssetService {
  return new AssetService(projects, new ImageStore(), userData)
}

describe('AssetService', () => {
  beforeEach(() => {
    vi.mocked(dialog.showOpenDialog).mockReset()
  })

  it('keeps one AssetRecord and one original for duplicate content', async () => {
    const { projectRoot, sourcePath, userData } = await fixture()
    const { projects, addTransientAssets } = projectStub(projectRoot)
    const service = makeService(projects, userData)

    const result = await service.importFiles(projectRoot, [sourcePath, sourcePath])

    expect(result.assets).toHaveLength(1)
    expect(result.duplicateAssetIds).toEqual([result.assets[0].id])
    expect(result.skipped).toEqual([])
    expect(result.assets[0]).not.toHaveProperty('originalRelativePath')
    expect(await readdir(join(projectRoot, 'assets', 'original'))).toEqual([
      `${result.assets[0].contentHash}.png`
    ])
    expect(addTransientAssets).toHaveBeenCalledWith(projectRoot, result.assets)
  })

  it('rejects extension/content mismatches without publishing an original', async () => {
    const { root, projectRoot, sourcePath, userData } = await fixture()
    const mislabeledPath = join(root, 'photo.jpg')
    await copyFile(sourcePath, mislabeledPath)
    const { projects } = projectStub(projectRoot)
    const service = makeService(projects, userData)

    const result = await service.importFiles(projectRoot, [mislabeledPath])

    expect(result.assets).toEqual([])
    expect(result.skipped).toEqual([
      { fileName: 'photo.jpg', reason: '文件内容与声明的图片格式不一致。' }
    ])
    expect(await readdir(join(projectRoot, 'assets', 'original'))).toEqual([])
  })

  it('picks candidates with metadata and preview URLs without writing the store', async () => {
    const { projectRoot, sourcePath, userData } = await fixture()
    const { projects } = projectStub(projectRoot)
    const service = makeService(projects, userData)
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [sourcePath]
    })

    const candidates = await service.chooseCandidates(
      {} as never,
      { projectPath: projectRoot, source: 'files' }
    )

    expect(candidates).toHaveLength(1)
    expect(candidates?.[0]).toMatchObject({
      id: 'candidate-1',
      fileName: 'photo.png',
      width: 96,
      height: 64,
      byteSize: expect.any(Number)
    })
    expect(candidates?.[0].previewUrl).toMatch(/^album-candidate:\/\/preview\/candidate-1\?v=/)
    await expect(readdir(join(projectRoot, 'assets', 'original'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('imports only the selected candidates and clears the session', async () => {
    const { projectRoot, sourcePath, userData } = await fixture()
    const secondSource = join(projectRoot, '..', 'second.png')
    await copyFile(sourcePath, secondSource)
    const { projects } = projectStub(projectRoot)
    const service = makeService(projects, userData)
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [sourcePath, secondSource]
    })

    await service.chooseCandidates({} as never, {
      projectPath: projectRoot,
      source: 'files'
    })
    const result = await service.importCandidates({
      projectPath: projectRoot,
      candidateIds: ['candidate-1']
    })

    expect(result?.assets).toHaveLength(1)
    expect(result?.assets[0].fileName).toBe('photo.png')
    expect(await service.resolveCandidatePreview('candidate-2')).toBeNull()
  })

  it('resolves and caches candidate previews, then clears them on release', async () => {
    const { projectRoot, sourcePath, userData } = await fixture()
    const { projects } = projectStub(projectRoot)
    const service = makeService(projects, userData)
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [sourcePath]
    })

    await service.chooseCandidates({} as never, {
      projectPath: projectRoot,
      source: 'files'
    })

    const first = await service.resolveCandidatePreview('candidate-1')
    const second = await service.resolveCandidatePreview('candidate-1')
    expect(first?.contentType).toBe('image/webp')
    expect(first?.data.length).toBeGreaterThan(0)
    expect(second).toEqual(first)

    await service.releaseCandidates({ candidateIds: ['candidate-1'] })
    expect(await service.resolveCandidatePreview('candidate-1')).toBeNull()
  })

  it('defaults the pick dialog to the folder used by the previous import', async () => {
    const { projectRoot, sourcePath, userData } = await fixture()
    const { projects } = projectStub(projectRoot)
    const service = makeService(projects, userData)

    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [sourcePath]
    })
    await service.chooseCandidates({} as never, { projectPath: projectRoot, source: 'files' })
    expect(dialog.showOpenDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultPath: undefined })
    )

    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [sourcePath]
    })
    await service.chooseCandidates({} as never, { projectPath: projectRoot, source: 'files' })
    expect(dialog.showOpenDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultPath: dirname(sourcePath) })
    )
  })

  it('remembers the folder choice across service instances and ignores canceled dialogs', async () => {
    const { projectRoot, sourcePath, userData } = await fixture()
    const { projects } = projectStub(projectRoot)
    const photoFolder = dirname(sourcePath)
    const firstService = makeService(projects, userData)

    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: true,
      filePaths: []
    })
    await firstService.chooseCandidates({} as never, {
      projectPath: projectRoot,
      source: 'folder'
    })
    expect(dialog.showOpenDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultPath: undefined })
    )

    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [photoFolder]
    })
    await firstService.chooseCandidates({} as never, {
      projectPath: projectRoot,
      source: 'folder'
    })

    const secondService = makeService(projects, userData)
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [photoFolder]
    })
    await secondService.chooseCandidates({} as never, {
      projectPath: projectRoot,
      source: 'folder'
    })
    expect(dialog.showOpenDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultPath: photoFolder })
    )
  })

  it('forgets the remembered folder once it no longer exists', async () => {
    const { root, projectRoot, sourcePath, userData } = await fixture()
    const { projects } = projectStub(projectRoot)
    const service = makeService(projects, userData)

    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [sourcePath]
    })
    await service.chooseCandidates({} as never, { projectPath: projectRoot, source: 'files' })

    await rm(root, { recursive: true, force: true })

    const freshService = makeService(projects, userData)
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({
      canceled: false,
      filePaths: [sourcePath]
    })
    await freshService.chooseCandidates({} as never, {
      projectPath: projectRoot,
      source: 'files'
    })
    expect(dialog.showOpenDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultPath: undefined })
    )
  })
})
