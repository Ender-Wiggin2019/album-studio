import {
  ALBUM_FORMAT_UPDATED_MESSAGE,
  AssetRecordSchema,
  DEFAULT_PAGE_SPEC
} from '@album-studio/common'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ showOpenDialog: vi.fn() }))

vi.mock('electron', () => ({
  app: { getPath: () => tmpdir() },
  dialog: { showOpenDialog: electron.showOpenDialog }
}))

import { ImageStore } from '../assets/image-store'
import { ProjectRepository } from './project-repository'

const temporaryRoots: string[] = []

afterEach(async () => {
  electron.showOpenDialog.mockReset()
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('ProjectRepository asset resolution', () => {
  it('reopens a manifest without physical paths and derives originals and rebuildable caches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'album-project-repository-'))
    temporaryRoots.push(root)
    const projectsParent = join(root, 'projects')
    const userData = join(root, 'user-data')
    const sourcePath = join(root, 'photo.png')
    await mkdir(projectsParent)
    await sharp({
      create: { width: 320, height: 200, channels: 3, background: { r: 20, g: 90, b: 180 } }
    })
      .png()
      .toFile(sourcePath)
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [projectsParent] })

    const images = new ImageStore()
    const firstRepository = new ProjectRepository(images, userData)
    const created = await firstRepository.createWithDialog({} as never, {
      title: '路径推导测试',
      themeId: 'journal',
      pageSpec: { ...DEFAULT_PAGE_SPEC }
    })
    expect(created).not.toBeNull()
    if (!created) throw new Error('项目创建失败')

    const stored = await images.importFile(created.projectPath, sourcePath)
    const asset = AssetRecordSchema.parse({
      id: `asset-${stored.contentHash}`,
      fileName: 'photo.png',
      contentHash: stored.contentHash,
      mimeType: stored.mimeType,
      byteSize: stored.byteSize,
      width: stored.width,
      height: stored.height,
      importedAt: new Date().toISOString()
    })
    await firstRepository.save(created.projectPath, {
      ...created.document,
      revision: 1,
      assets: [asset]
    })

    const manifest = JSON.parse(await readFile(join(created.projectPath, 'manifest.json'), 'utf8'))
    expect(manifest.assets[0]).not.toHaveProperty('originalRelativePath')
    expect(manifest.assets[0]).not.toHaveProperty('previewRelativePath')
    expect(manifest.assets[0]).not.toHaveProperty('printRelativePath')

    const reopenedRepository = new ProjectRepository(images, userData)
    const reopened = await reopenedRepository.openRecent(created.projectPath)
    expect(reopened.document.assets).toEqual([asset])
    const originalPath = await reopenedRepository.resolveAsset(reopened.document.id, asset.id, {
      variant: 'original'
    })
    expect(
      originalPath.endsWith(join('assets', 'original', `${stored.contentHash}.png`))
    ).toBe(true)

    const previewPath = await reopenedRepository.resolveAsset(reopened.document.id, asset.id, {
      variant: 'preview'
    })
    await unlink(previewPath)
    expect(
      await reopenedRepository.resolveAsset(reopened.document.id, asset.id, {
        variant: 'preview'
      })
    ).toBe(previewPath)

    const printPath = await reopenedRepository.resolveAsset(reopened.document.id, asset.id, {
      variant: 'print',
      usage: { widthFraction: 0.25, heightFraction: 0.5 }
    })
    expect(printPath).toMatch(/print-877x1240\.webp$/)
  })

  it('reports old manifests separately from damaged v2 projects', async () => {
    const root = await mkdtemp(join(tmpdir(), 'album-project-format-'))
    temporaryRoots.push(root)
    const projectRoot = join(root, 'old.album-project')
    await mkdir(projectRoot)
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [projectRoot] })
    const repository = new ProjectRepository(new ImageStore(), join(root, 'user-data'))

    await writeFile(join(projectRoot, 'manifest.json'), '{"schemaVersion":1}', 'utf8')
    await expect(repository.chooseAndOpen({} as never)).rejects.toThrow(
      ALBUM_FORMAT_UPDATED_MESSAGE
    )

    await writeFile(join(projectRoot, 'manifest.json'), '{"schemaVersion":2}', 'utf8')
    await expect(repository.chooseAndOpen({} as never)).rejects.toMatchObject({ name: 'ZodError' })
  })
})
