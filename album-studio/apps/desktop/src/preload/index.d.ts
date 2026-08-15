import type { AlbumStudioApi } from '@album-studio/common'

declare global {
  interface Window {
    albumStudio: AlbumStudioApi
  }
}

export {}
