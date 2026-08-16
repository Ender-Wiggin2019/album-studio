import type { AlbumDocument, AssetRecord, CreateProjectRequest } from '@album-studio/common'
import type { SaveDocumentResult } from '../project-save-session'

export type { SaveDocumentResult } from '../project-save-session'

export type StudioCapability =
  'folder-import' | 'native-pdf' | 'asset-relink' | 'durable-project-folder'

export type RecentStudioProject = Pick<AlbumDocument, 'id' | 'title' | 'themeId' | 'updatedAt'> & {
  missing: boolean
}

export type ImportAssetsResult = {
  assets: AssetRecord[]
  duplicateAssetIds: string[]
  skipped: Array<{ fileName: string; reason: string }>
}

export type AssetQuality = 'thumbnail' | 'preview' | 'print' | 'original'

export type AssetSourceRequest = {
  quality: AssetQuality
  /** Block width divided by its album page width. */
  pageWidthRatio?: number
  /** Block height divided by its album page height. */
  pageHeightRatio?: number
}

export type ExportDocumentResult = {
  displayName: string
  byteSize?: number
}

/**
 * The only host boundary visible to the shared Studio application.
 *
 * Adapters keep physical paths, IPC channel names, OPFS handles and object URL
 * ownership private. The document id is the stable logical handle on both
 * desktop and web.
 */
export interface StudioPlatform {
  readonly kind: 'desktop' | 'web'
  readonly capabilities: ReadonlySet<StudioCapability>
  readonly projects: {
    listRecent(): Promise<RecentStudioProject[]>
    create(input: CreateProjectRequest): Promise<AlbumDocument | null>
    chooseAndOpen(): Promise<AlbumDocument | null>
    open(projectId: string): Promise<AlbumDocument>
    save(document: AlbumDocument): Promise<SaveDocumentResult>
  }
  readonly assets: {
    import(documentId: string, source: 'files' | 'folder'): Promise<ImportAssetsResult | null>
    relink(documentId: string, assetId: string): Promise<AssetRecord | null>
    getSource(documentId: string, assetId: string, request: AssetSourceRequest): Promise<string>
    releaseSource(source: string): void
  }
  readonly export: {
    pdf(document: AlbumDocument): Promise<ExportDocumentResult | null>
  }
  readonly lifecycle: {
    onCloseRequest(listener: () => void): () => void
    closeReady(input: { ok: boolean; error?: string }): Promise<void>
  }
}
