import { createAlbumDocument, type AlbumDocument, type AlbumStudioApi } from '@album-studio/common'
import { describe, expect, it, vi } from 'vitest'
import { createDesktopPlatform } from './desktop-platform'

const document: AlbumDocument = {
  ...createAlbumDocument(
    {
      title: '夏日相册',
      now: '2026-08-15T00:00:00.000Z',
      pageSpec: { presetId: 'a4-landscape', widthMm: 297, heightMm: 210 }
    },
    (() => {
      let id = 0
      return () => `album-${++id}`
    })()
  ),
  revision: 3,
  id: 'album-1'
}

function createApi(): AlbumStudioApi {
  return {
    projects: {
      listRecent: vi.fn(async () => [
        {
          id: document.id,
          title: document.title,
          path: '/private/album-path',
          updatedAt: document.updatedAt,
          themeId: document.themeId,
          missing: false
        }
      ]),
      create: vi.fn(async () => null),
      chooseAndOpen: vi.fn(async () => null),
      openPath: vi.fn(async () => ({ projectPath: '/private/album-path', document })),
      save: vi.fn(async () => ({ revision: document.revision, savedAt: document.updatedAt }))
    },
    assets: {
      import: vi.fn(async () => null),
      relink: vi.fn(async () => null),
      url: vi.fn(() => 'album-asset://project/album-1/asset-1?quality=print')
    },
    export: { pdf: vi.fn(async () => null) },
    system: {
      platform: 'darwin',
      versions: { electron: '43', chrome: '140', node: '22' },
      onCloseRequest: vi.fn(() => () => undefined),
      closeReady: vi.fn(async () => undefined)
    }
  }
}

describe('createDesktopPlatform', () => {
  it('keeps physical project paths private while reopening a recent document', async () => {
    const api = createApi()
    const platform = createDesktopPlatform(api)

    await expect(platform.projects.listRecent()).resolves.toEqual([
      {
        id: document.id,
        title: document.title,
        themeId: document.themeId,
        updatedAt: document.updatedAt,
        missing: false
      }
    ])
    await expect(platform.projects.open(document.id)).resolves.toEqual(document)
    expect(api.projects.openPath).toHaveBeenCalledWith('/private/album-path')
  })

  it('converts a print request to normalized protocol width and height', async () => {
    const api = createApi()
    const platform = createDesktopPlatform(api)

    await platform.assets.getSource(document.id, 'asset-1', {
      quality: 'print',
      pageWidthRatio: 0.25,
      pageHeightRatio: 2
    })

    expect(api.assets.url).toHaveBeenCalledWith(document.id, 'asset-1', 'print', {
      width: 0.25,
      height: 1
    })
  })
})
