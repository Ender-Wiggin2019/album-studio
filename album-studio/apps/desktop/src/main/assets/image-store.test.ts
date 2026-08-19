import { createHash } from 'node:crypto'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
// Windows 上 libvips 会缓存已打开文件的句柄，导致 metadata 读取后的 unlink 报 EBUSY；测试内禁用缓存以释放句柄。
sharp.cache(false)
import type { PageSpec } from '@album-studio/common'
import {
  derivativeRelativePath,
  ImageStore,
  originalRelativePath,
  printTargetForUsage,
  type StoredImageIdentity
} from './image-store'

const PAGE_SPECS = {
  a4: { presetId: 'a4-landscape', widthMm: 297, heightMm: 210 },
  square: { presetId: 'square-12', widthMm: 304.8, heightMm: 304.8 },
  widescreen: { presetId: 'widescreen-16-9', widthMm: 338.67, heightMm: 190.5 }
} as const satisfies Record<string, PageSpec>

const temporaryRoots: string[] = []

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'album-image-store-'))
  temporaryRoots.push(root)
  return root
}

async function createPng(path: string, width = 64, height = 48): Promise<void> {
  await sharp({
    create: { width, height, channels: 3, background: { r: 32, g: 96, b: 160 } }
  })
    .png()
    .toFile(path)
}

function identity(stored: Awaited<ReturnType<ImageStore['importFile']>>): StoredImageIdentity {
  return {
    contentHash: stored.contentHash,
    mimeType: stored.mimeType,
    width: stored.width,
    height: stored.height
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  )
})

describe('ImageStore', () => {
  it('streams originals into one content-addressed file and reports duplicates', async () => {
    const root = await temporaryRoot()
    const projectRoot = join(root, 'project')
    const sourcePath = join(root, 'photo.png')
    await mkdir(projectRoot)
    await createPng(sourcePath)
    const expectedHash = createHash('sha256')
      .update(await readFile(sourcePath))
      .digest('hex')
    const store = new ImageStore()

    const first = await store.importFile(projectRoot, sourcePath)
    const second = await store.importFile(projectRoot, sourcePath)

    expect(first).toMatchObject({
      contentHash: expectedHash,
      mimeType: 'image/png',
      duplicate: false
    })
    expect(second).toMatchObject({ contentHash: expectedHash, duplicate: true })
    expect(await readdir(join(projectRoot, 'assets', 'original'))).toEqual([`${expectedHash}.png`])
  })

  it('stores visual dimensions and produces auto-oriented derivatives from EXIF', async () => {
    const root = await temporaryRoot()
    const projectRoot = join(root, 'project')
    const sourcePath = join(root, 'portrait.jpg')
    await mkdir(projectRoot)
    await sharp({
      create: { width: 80, height: 40, channels: 3, background: { r: 220, g: 60, b: 40 } }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(sourcePath)
    const store = new ImageStore()

    const stored = await store.importFile(projectRoot, sourcePath)
    const previewPath = await store.resolve(projectRoot, identity(stored), { variant: 'preview' })
    const preview = await sharp(previewPath).metadata()

    expect(stored).toMatchObject({ width: 40, height: 80 })
    expect(preview).toMatchObject({ format: 'webp', width: 40, height: 80, space: 'srgb' })
    expect(preview.orientation).toBeUndefined()
  })

  it('rejects images over the configured total-pixel limit and removes temporary files', async () => {
    const root = await temporaryRoot()
    const projectRoot = join(root, 'project')
    const sourcePath = join(root, 'too-large.png')
    await mkdir(projectRoot)
    await createPng(sourcePath, 20, 20)
    const store = new ImageStore({ maxInputPixels: 100 })

    await expect(store.importFile(projectRoot, sourcePath)).rejects.toThrow(/像素|解码/)
    expect(await readdir(join(projectRoot, 'assets', 'original'))).toEqual([])
  })

  it('cleans the fsynced temporary original when atomic publication cannot proceed', async () => {
    const root = await temporaryRoot()
    const projectRoot = join(root, 'project')
    const sourcePath = join(root, 'photo.png')
    await mkdir(projectRoot)
    await createPng(sourcePath)
    const contentHash = createHash('sha256')
      .update(await readFile(sourcePath))
      .digest('hex')
    const conflictingPath = join(projectRoot, 'assets', 'original', `${contentHash}.png`)
    await mkdir(conflictingPath, { recursive: true })
    const store = new ImageStore()

    await expect(store.importFile(projectRoot, sourcePath)).rejects.toThrow(/普通文件/)
    expect((await readdir(dirname(conflictingPath))).every((name) => !name.endsWith('.tmp'))).toBe(
      true
    )
  })

  it('rebuilds a missing versioned WebP cache and coalesces concurrent requests', async () => {
    const root = await temporaryRoot()
    const projectRoot = join(root, 'project')
    const sourcePath = join(root, 'photo.png')
    await mkdir(projectRoot)
    await createPng(sourcePath, 400, 300)
    const store = new ImageStore()
    const stored = await store.importFile(projectRoot, sourcePath)
    const asset = identity(stored)

    const paths = await Promise.all(
      Array.from({ length: 6 }, () => store.resolve(projectRoot, asset, { variant: 'preview' }))
    )
    expect(new Set(paths).size).toBe(1)
    expect((await sharp(paths[0]).metadata()).format).toBe('webp')

    const firstBytes = await readFile(paths[0])
    await unlink(paths[0])
    const rebuiltPath = await store.resolve(projectRoot, asset, { variant: 'preview' })
    expect(rebuiltPath).toBe(paths[0])
    expect(await readFile(rebuiltPath)).toEqual(firstBytes)
  })

  it('sizes all supported print pages at 300 DPI and validates element usage', async () => {
    const root = await temporaryRoot()
    const projectRoot = join(root, 'project')
    const sourcePath = join(root, 'photo.png')
    await mkdir(projectRoot)
    await createPng(sourcePath, 400, 300)
    const store = new ImageStore()
    const stored = await store.importFile(projectRoot, sourcePath)
    const asset = identity(stored)

    expect(printTargetForUsage(PAGE_SPECS.a4)).toEqual({ width: 3508, height: 2480 })
    expect(printTargetForUsage(PAGE_SPECS.square)).toEqual({ width: 3600, height: 3600 })
    expect(printTargetForUsage(PAGE_SPECS.widescreen)).toEqual({ width: 4000, height: 2250 })
    expect(
      printTargetForUsage(PAGE_SPECS.a4, {
        widthFraction: 0.1,
        heightFraction: 0.1
      })
    ).toEqual({
      width: 351,
      height: 248
    })
    const printPath = await store.resolve(projectRoot, asset, {
      variant: 'print',
      pageSpec: PAGE_SPECS.a4,
      usage: { widthFraction: 0.1, heightFraction: 0.1 }
    })
    expect(await sharp(printPath).metadata()).toMatchObject({
      format: 'webp',
      width: 351,
      height: 263
    })
    expect(basename(printPath)).toBe('print-351x248.webp')
  })

  it('stores erased results and only serves them read-only', async () => {
    const root = await temporaryRoot()
    const projectRoot = join(root, 'project')
    const sourcePath = join(root, 'photo.png')
    await mkdir(projectRoot)
    await createPng(sourcePath)
    const store = new ImageStore()
    const stored = await store.importFile(projectRoot, sourcePath)
    const asset = identity(stored)
    const eraseKey = 'abc123def456'
    expect(
      derivativeRelativePath(asset, { variant: 'erased', usage: { eraseKey } })
    ).toBe(`assets/cache/1/${asset.contentHash}/erased-${eraseKey}.webp`)

    const webp = await sharp({
      create: {
        width: stored.width,
        height: stored.height,
        channels: 3,
        background: { r: 200, g: 40, b: 40 }
      }
    })
      .webp()
      .toBuffer()
    const written = await store.writeErased(projectRoot, asset, eraseKey, webp)
    expect(basename(written)).toBe(`erased-${eraseKey}.webp`)
    await expect(
      store.resolve(projectRoot, asset, { variant: 'erased', usage: { eraseKey } })
    ).resolves.toBe(written)

    // 缺失的消除结果抛错（协议层转 404），不会自动生成
    await expect(
      store.resolve(projectRoot, asset, { variant: 'erased', usage: { eraseKey: 'zzzz9999' } })
    ).rejects.toThrow(/缓存缺失/)
    await expect(store.writeErased(projectRoot, asset, 'bad/key!', webp)).rejects.toThrow(/键无效/)
    await expect(store.writeErased(projectRoot, asset, '../escape', webp)).rejects.toThrow(/键无效/)
  })

  it('derives safe paths only from hashes, MIME types, pipeline version, and variants', () => {
    const asset = {
      contentHash: 'a'.repeat(64),
      mimeType: 'image/jpeg' as const,
      width: 100,
      height: 100
    }

    expect(originalRelativePath(asset)).toBe(`assets/original/${'a'.repeat(64)}.jpg`)
    expect(derivativeRelativePath(asset, { variant: 'preview' })).toBe(
      `assets/cache/1/${'a'.repeat(64)}/preview-1600x1200.webp`
    )
    expect(
      new Set(
        Object.values(PAGE_SPECS).map((pageSpec) =>
          derivativeRelativePath(asset, { variant: 'print', pageSpec })
        )
      ).size
    ).toBe(3)
    expect(() => originalRelativePath({ ...asset, contentHash: '../outside' })).toThrow(/指纹/)
    expect(() =>
      printTargetForUsage(PAGE_SPECS.square, { widthFraction: 2, heightFraction: 0.5 })
    ).toThrow(/页面比例/)
    expect(() =>
      printTargetForUsage({
        presetId: 'a4-landscape',
        widthMm: 210,
        heightMm: 297
      } as unknown as PageSpec)
    ).toThrow()
  })

  it.runIf(process.platform !== 'win32')(
    'rejects an original symlink even when it stays inside the project',
    async () => {
      const root = await temporaryRoot()
      const projectRoot = join(root, 'project')
      const sourcePath = join(root, 'photo.png')
      await mkdir(projectRoot)
      await createPng(sourcePath)
      const store = new ImageStore()
      const stored = await store.importFile(projectRoot, sourcePath)
      const asset = identity(stored)
      const originalPath = join(projectRoot, ...originalRelativePath(asset).split('/'))
      const backupPath = `${originalPath}.backup`
      await writeFile(backupPath, await readFile(originalPath))
      await unlink(originalPath)
      await symlink(backupPath, originalPath)

      await expect(store.resolve(projectRoot, asset, { variant: 'original' })).rejects.toThrow(
        /普通文件/
      )
      expect((await lstat(originalPath)).isSymbolicLink()).toBe(true)
    }
  )
})
