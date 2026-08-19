import { z } from 'zod'
import {
  AlbumDocumentSchema,
  AssetRecordSchema,
  ImageEraseSchema,
  PageSpecSchema,
  ThemeIdSchema,
  type AssetRecord
} from '../album/schema'

export const IPC_CHANNELS = {
  projectsListRecent: 'projects:list-recent',
  projectsCreate: 'projects:create',
  projectsChooseAndOpen: 'projects:choose-and-open',
  projectsOpenPath: 'projects:open-path',
  projectsSave: 'projects:save',
  assetsPickCandidates: 'assets:pick-candidates',
  assetsImportCandidates: 'assets:import-candidates',
  assetsReleaseCandidates: 'assets:release-candidates',
  assetsRelink: 'assets:relink',
  exportPdf: 'export:pdf',
  imageEraseDetect: 'image:erase:detect',
  imageEraseApply: 'image:erase:apply',
  appCloseRequest: 'app:close-request',
  appCloseReady: 'app:close-ready'
} as const

export const RecentProjectSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    path: z.string().min(1),
    updatedAt: z.string().datetime(),
    themeId: ThemeIdSchema,
    missing: z.boolean()
  })
  .strict()
export type RecentProject = z.infer<typeof RecentProjectSchema>

export const CreateProjectRequestSchema = z
  .object({
    title: z.string().min(1).max(160),
    themeId: ThemeIdSchema,
    pageSpec: PageSpecSchema
  })
  .strict()
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>

export const OpenProjectResultSchema = z
  .object({
    projectPath: z.string().min(1),
    document: AlbumDocumentSchema
  })
  .strict()
export type OpenProjectResult = z.infer<typeof OpenProjectResultSchema>

export const SaveProjectRequestSchema = z
  .object({
    projectPath: z.string().min(1),
    document: AlbumDocumentSchema
  })
  .strict()
export type SaveProjectRequest = z.infer<typeof SaveProjectRequestSchema>

export const SaveProjectResultSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    savedAt: z.string().datetime()
  })
  .strict()
export type SaveProjectResult = z.infer<typeof SaveProjectResultSchema>

export const ImportCandidateSchema = z
  .object({
    id: z.string().min(1),
    fileName: z.string().min(1),
    byteSize: z.number().int().nonnegative(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    previewUrl: z.string().min(1)
  })
  .strict()
export type ImportCandidate = z.infer<typeof ImportCandidateSchema>

export const PickImportCandidatesRequestSchema = z
  .object({
    projectPath: z.string().min(1),
    source: z.enum(['files', 'folder'])
  })
  .strict()
export type PickImportCandidatesRequest = z.infer<typeof PickImportCandidatesRequestSchema>

export const ImportCandidatesRequestSchema = z
  .object({
    projectPath: z.string().min(1),
    candidateIds: z.array(z.string().min(1))
  })
  .strict()
export type ImportCandidatesRequest = z.infer<typeof ImportCandidatesRequestSchema>

export const ReleaseCandidatesRequestSchema = z
  .object({
    candidateIds: z.array(z.string().min(1))
  })
  .strict()
export type ReleaseCandidatesRequest = z.infer<typeof ReleaseCandidatesRequestSchema>

export const ImportAssetsResultSchema = z
  .object({
    assets: z.array(AssetRecordSchema),
    duplicateAssetIds: z.array(z.string().min(1)),
    skipped: z.array(z.object({ fileName: z.string().min(1), reason: z.string().min(1) }).strict())
  })
  .strict()
export type ImportAssetsResult = z.infer<typeof ImportAssetsResultSchema>

export const RelinkAssetRequestSchema = z
  .object({
    projectPath: z.string().min(1),
    assetId: z.string().min(1)
  })
  .strict()
export type RelinkAssetRequest = z.infer<typeof RelinkAssetRequestSchema>

export const ExportPdfRequestSchema = z
  .object({
    projectPath: z.string().min(1),
    suggestedName: z.string().min(1),
    revision: z.number().int().nonnegative()
  })
  .strict()
export type ExportPdfRequest = z.infer<typeof ExportPdfRequestSchema>

export const ExportPdfResultSchema = z
  .object({
    path: z.string().min(1),
    byteSize: z.number().int().positive()
  })
  .strict()
export type ExportPdfResult = z.infer<typeof ExportPdfResultSchema>

export const EraseDetectRequestSchema = z
  .object({
    projectPath: z.string().min(1),
    assetId: z.string().min(1)
  })
  .strict()
export type EraseDetectRequest = z.infer<typeof EraseDetectRequestSchema>

/**
 * 自动识别的人物遮罩。maskBase64 为单通道 PNG 的 Base64 编码，
 * 与原图同像素尺寸；renderer 叠加笔划后仅用于界面预览，
 * 权威遮罩始终由 main 根据参数重建。
 */
export const EraseDetectResultSchema = z
  .object({
    maskBase64: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
  .strict()
export type EraseDetectResult = z.infer<typeof EraseDetectResultSchema>

export const EraseApplyRequestSchema = z
  .object({
    projectPath: z.string().min(1),
    assetId: z.string().min(1),
    erase: ImageEraseSchema
  })
  .strict()
export type EraseApplyRequest = z.infer<typeof EraseApplyRequestSchema>

/**
 * 修补结果已写入派生缓存（结果与原图同像素尺寸）。
 * eraseKey 由 common `eraseKeyFor` 计算，renderer 用它构造
 * `quality=erased&erase=<eraseKey>` 的取图地址。
 */
export const EraseApplyResultSchema = z
  .object({
    eraseKey: z.string().min(1).max(64),
    width: z.number().int().positive(),
    height: z.number().int().positive()
  })
  .strict()
export type EraseApplyResult = z.infer<typeof EraseApplyResultSchema>

export type AlbumStudioApi = {
  projects: {
    listRecent: () => Promise<RecentProject[]>
    create: (input: CreateProjectRequest) => Promise<OpenProjectResult | null>
    chooseAndOpen: () => Promise<OpenProjectResult | null>
    openPath: (projectPath: string) => Promise<OpenProjectResult>
    save: (input: SaveProjectRequest) => Promise<SaveProjectResult>
  }
  assets: {
    pickCandidates: (input: PickImportCandidatesRequest) => Promise<ImportCandidate[] | null>
    importCandidates: (input: ImportCandidatesRequest) => Promise<ImportAssetsResult | null>
    releaseCandidates: (input: ReleaseCandidatesRequest) => Promise<void>
    relink: (input: RelinkAssetRequest) => Promise<AssetRecord | null>
    url: (
      projectId: string,
      assetId: string,
      quality?: 'thumbnail' | 'preview' | 'print' | 'original' | 'erased',
      usage?: { width?: number; height?: number; eraseKey?: string }
    ) => string
  }
  imageErase: {
    detect: (input: EraseDetectRequest) => Promise<EraseDetectResult>
    apply: (input: EraseApplyRequest) => Promise<EraseApplyResult>
  }
  export: {
    pdf: (input: ExportPdfRequest) => Promise<ExportPdfResult | null>
  }
  system: {
    platform: NodeJS.Platform
    versions: { electron: string; chrome: string; node: string }
    onCloseRequest: (listener: () => void) => () => void
    closeReady: (input: { ok: boolean; error?: string }) => Promise<void>
  }
}
