import type {
  AlbumDocument,
  AssetRecord,
  CreateProjectRequest,
  EraseApplyResult,
  EraseDetectResult,
  ImageCrop,
  ImageErase,
  ImportCandidate as CommonImportCandidate,
  ImportCandidateSession as CommonImportCandidateSession
} from '@album-studio/common'
import type { SaveDocumentResult } from '../project-save-session'

export type { SaveDocumentResult } from '../project-save-session'

export type StudioCapability =
  'folder-import' | 'native-pdf' | 'asset-relink' | 'durable-project-folder' | 'erase-people'

export type RecentStudioProject = Pick<AlbumDocument, 'id' | 'title' | 'themeId' | 'updatedAt'> & {
  missing: boolean
}

export type ImportAssetsResult = {
  assets: AssetRecord[]
  duplicateAssetIds: string[]
  skipped: Array<{ fileName: string; reason: string }>
}

/** 导入前候选照片：只描述来源文件，尚未写入项目。previewUrl 由平台持有。 */
export type ImportCandidate = CommonImportCandidate
/** 候选会话绑定打开它的项目；关闭、替换或卸载后必须按会话 ID 释放。 */
export type ImportCandidateSession = CommonImportCandidateSession

export type AssetQuality = 'thumbnail' | 'preview' | 'print' | 'original' | 'erased'

export type AssetSourceRequest = {
  quality: AssetQuality
  /** Block width divided by its album page width. */
  pageWidthRatio?: number
  /** Block height divided by its album page height. */
  pageHeightRatio?: number
  /** 打印派生图按最终可见裁剪区 cover Block 所需的尺寸生成。 */
  crop?: ImageCrop
  /** 消除结果取图键（quality 为 erased 时必填）。 */
  eraseKey?: string
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
    pickCandidates(
      documentId: string,
      source: 'files' | 'folder'
    ): Promise<ImportCandidateSession | null>
    importCandidates(
      documentId: string,
      sessionId: string,
      candidateIds: string[]
    ): Promise<ImportAssetsResult | null>
    releaseCandidates(sessionId: string): Promise<void>
    relink(documentId: string, assetId: string): Promise<AssetRecord | null>
    getSource(documentId: string, assetId: string, request: AssetSourceRequest): Promise<string>
    releaseSource(source: string): void
  }
  readonly export: {
    pdf(document: AlbumDocument): Promise<ExportDocumentResult | null>
  }
  readonly imageErase: {
    detect(documentId: string, assetId: string): Promise<EraseDetectResult>
    apply(documentId: string, assetId: string, erase: ImageErase): Promise<EraseApplyResult>
  }
  readonly lifecycle: {
    onCloseRequest(listener: () => void): () => void
    closeReady(input: { ok: boolean; error?: string }): Promise<void>
  }
}
