import {
  createAlbumDocument,
  eraseKeyFor,
  executeAlbumCommand,
  type AlbumDocument,
  type AssetRecord,
  type ImageErase
} from '@album-studio/common'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImageStore } from '../assets/image-store'
import type { ProjectRepository } from '../projects/project-repository'
import { emptyMask } from './erase-mask'
import { EraseService } from './erase-service'
import type { EraseInferenceService } from './inference-service'

sharp.cache(false)

const NOW = '2026-08-18T00:00:00.000Z'

function assetRecord(): AssetRecord {
  return {
    id: 'asset-1',
    fileName: 'photo.jpg',
    contentHash: 'a'.repeat(64),
    mimeType: 'image/jpeg',
    byteSize: 42,
    width: 640,
    height: 480,
    importedAt: NOW
  }
}

function documentWithAsset(): AlbumDocument {
  let id = 0
  const document = createAlbumDocument({ title: '消除测试', now: NOW }, () => `id-${++id}`)
  return executeAlbumCommand(document, { type: 'register-assets', assets: [assetRecord()] })
    .document
}

function fakeProjects(document: AlbumDocument): ProjectRepository {
  return {
    getRegisteredProjectByPath: vi.fn(() => ({ root: '/project-root', document }))
  } as unknown as ProjectRepository
}

function fakeImages(): {
  images: ImageStore
  resolve: ReturnType<typeof vi.fn>
  getOrCreateErased: ReturnType<typeof vi.fn>
} {
  const resolve = vi.fn(async () => '/project-root/assets/original/original.jpg')
  const getOrCreateErased = vi.fn(
    async (_root, _asset, _eraseKey, createImage: () => Promise<Buffer>) => {
      await createImage()
      return '/project-root/erased.webp'
    }
  )
  return {
    images: { resolve, getOrCreateErased } as unknown as ImageStore,
    resolve,
    getOrCreateErased
  }
}

function fakeInference(): {
  inference: EraseInferenceService
  detectPersons: ReturnType<typeof vi.fn>
  inpaint: ReturnType<typeof vi.fn>
} {
  const detectPersons = vi.fn(async () => {
    const mask = emptyMask(640, 480)
    mask.fill(255)
    return { mask, width: 640, height: 480 }
  })
  const inpaint = vi.fn(async () => Buffer.from('webp-bytes'))
  return {
    inference: { detectPersons, inpaint } as unknown as EraseInferenceService,
    detectPersons,
    inpaint
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EraseService', () => {
  it('detects persons and returns a base64 PNG mask at image size', async () => {
    const projects = fakeProjects(documentWithAsset())
    const { images, resolve } = fakeImages()
    const { inference, detectPersons } = fakeInference()
    const service = new EraseService(projects, images, inference)

    const result = await service.detect({ projectPath: '/project-root', assetId: 'asset-1' })
    expect(projects.getRegisteredProjectByPath).toHaveBeenCalledWith('/project-root')
    expect(resolve).toHaveBeenCalledWith(
      '/project-root',
      expect.objectContaining({ contentHash: 'a'.repeat(64) }),
      { variant: 'original' }
    )
    expect(detectPersons).toHaveBeenCalledWith('/project-root/assets/original/original.jpg')
    expect(result).toMatchObject({ width: 640, height: 480 })
    const png = Buffer.from(result.maskBase64, 'base64')
    const metadata = await sharp(png).metadata()
    expect(metadata.format).toBe('png')
    expect(metadata.width).toBe(640)
    expect(metadata.height).toBe(480)
  })

  it('applies erase: merges mask, inpaints, writes cache and returns eraseKey', async () => {
    const document = documentWithAsset()
    const projects = fakeProjects(document)
    const { images, getOrCreateErased } = fakeImages()
    const { inference, inpaint } = fakeInference()
    const service = new EraseService(projects, images, inference)
    const erase: ImageErase = {
      autoDetect: true,
      strokes: [
        {
          mode: 'add',
          size: 0.1,
          points: [
            { x: 0.5, y: 0.5 },
            { x: 0.6, y: 0.5 }
          ]
        }
      ]
    }

    const result = await service.apply({
      projectPath: '/project-root',
      assetId: 'asset-1',
      erase
    })
    expect(result).toEqual({ eraseKey: eraseKeyFor(erase), width: 640, height: 480 })
    expect(inpaint).toHaveBeenCalledWith(
      '/project-root/assets/original/original.jpg',
      expect.any(Uint8Array),
      640,
      480
    )
    // 自动遮罩被笔划合并（全程 255 的自动遮罩仍为 255）
    const mask = inpaint.mock.calls[0][1] as Uint8Array
    expect(mask[240 * 640 + 320]).toBe(255)
    expect(getOrCreateErased).toHaveBeenCalledWith(
      '/project-root',
      expect.objectContaining({ id: 'asset-1' }),
      result.eraseKey,
      expect.any(Function)
    )
  })

  it('uses only strokes when autoDetect is disabled', async () => {
    const projects = fakeProjects(documentWithAsset())
    const { images } = fakeImages()
    const { inference, detectPersons, inpaint } = fakeInference()
    const service = new EraseService(projects, images, inference)
    const erase: ImageErase = {
      autoDetect: false,
      strokes: [
        {
          mode: 'add',
          size: 0.1,
          points: [
            { x: 0.5, y: 0.5 },
            { x: 0.5, y: 0.5 }
          ]
        }
      ]
    }

    await service.apply({ projectPath: '/project-root', assetId: 'asset-1', erase })
    expect(detectPersons).not.toHaveBeenCalled()
    const mask = inpaint.mock.calls[0][1] as Uint8Array
    expect(mask[240 * 640 + 320]).toBe(255) // 笔划位置
    expect(mask[0]).toBe(0) // 其余为 0
  })

  it('skips original decoding and inference when the erased cache already exists', async () => {
    const projects = fakeProjects(documentWithAsset())
    const { images, resolve, getOrCreateErased } = fakeImages()
    const { inference, detectPersons, inpaint } = fakeInference()
    getOrCreateErased.mockResolvedValue('/project-root/erased.webp')
    const service = new EraseService(projects, images, inference)

    await service.apply({
      projectPath: '/project-root',
      assetId: 'asset-1',
      erase: { autoDetect: true, strokes: [] }
    })

    expect(resolve).not.toHaveBeenCalled()
    expect(detectPersons).not.toHaveBeenCalled()
    expect(inpaint).not.toHaveBeenCalled()
  })

  it('rejects assets that are not in the current project', async () => {
    const projects = fakeProjects(documentWithAsset())
    const { images } = fakeImages()
    const { inference } = fakeInference()
    const service = new EraseService(projects, images, inference)

    await expect(
      service.detect({ projectPath: '/project-root', assetId: 'missing' })
    ).rejects.toThrow(/不在当前项目中/)
    await expect(
      service.apply({
        projectPath: '/project-root',
        assetId: 'missing',
        erase: { autoDetect: false, strokes: [] }
      })
    ).rejects.toThrow(/不在当前项目中/)
  })

  it('rejects invalid erase payloads before touching anything', async () => {
    const projects = fakeProjects(documentWithAsset())
    const { images } = fakeImages()
    const { inference, detectPersons, inpaint } = fakeInference()
    const service = new EraseService(projects, images, inference)

    await expect(
      service.apply({
        projectPath: '/project-root',
        assetId: 'asset-1',
        erase: {
          autoDetect: false,
          strokes: [{ mode: 'add', size: 0.1, points: [{ x: 0.5, y: 0.5 }] }]
        }
      })
    ).rejects.toThrow()
    expect(detectPersons).not.toHaveBeenCalled()
    expect(inpaint).not.toHaveBeenCalled()
  })

  it('derives the cache key deterministically from erase parameters', () => {
    const erase: ImageErase = { autoDetect: true, strokes: [] }
    expect(eraseKeyFor({ autoDetect: true, strokes: [] })).toBe(eraseKeyFor(erase))
    expect(eraseKeyFor({ autoDetect: false, strokes: [] })).not.toBe(eraseKeyFor(erase))
  })
})
