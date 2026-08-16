import { createAlbumDocument } from '@album-studio/common'
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {},
  dialog: { showOpenDialog: vi.fn() }
}))

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
}> {
  const root = await mkdtemp(join(tmpdir(), 'album-asset-service-'))
  temporaryRoots.push(root)
  const projectRoot = join(root, 'project')
  const sourcePath = join(root, 'photo.png')
  await mkdir(projectRoot)
  await sharp({
    create: { width: 96, height: 64, channels: 3, background: { r: 70, g: 140, b: 210 } }
  })
    .png()
    .toFile(sourcePath)
  return { root, projectRoot, sourcePath }
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

describe('AssetService', () => {
  it('keeps one AssetRecord and one original for duplicate content', async () => {
    const { projectRoot, sourcePath } = await fixture()
    const { projects, addTransientAssets } = projectStub(projectRoot)
    const service = new AssetService(projects, new ImageStore())

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
    const { root, projectRoot, sourcePath } = await fixture()
    const mislabeledPath = join(root, 'photo.jpg')
    await copyFile(sourcePath, mislabeledPath)
    const { projects } = projectStub(projectRoot)
    const service = new AssetService(projects, new ImageStore())

    const result = await service.importFiles(projectRoot, [mislabeledPath])

    expect(result.assets).toEqual([])
    expect(result.skipped).toEqual([
      { fileName: 'photo.jpg', reason: '文件内容与声明的图片格式不一致。' }
    ])
    expect(await readdir(join(projectRoot, 'assets', 'original'))).toEqual([])
  })
})
