import { z } from 'zod'
import {
  AlbumDocumentSchema,
  AssetRecordSchema,
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
  assetsImport: 'assets:import',
  assetsRelink: 'assets:relink',
  exportPdf: 'export:pdf',
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

export const ImportAssetsRequestSchema = z
  .object({
    projectPath: z.string().min(1),
    source: z.enum(['files', 'folder'])
  })
  .strict()
export type ImportAssetsRequest = z.infer<typeof ImportAssetsRequestSchema>

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

export type AlbumStudioApi = {
  projects: {
    listRecent: () => Promise<RecentProject[]>
    create: (input: CreateProjectRequest) => Promise<OpenProjectResult | null>
    chooseAndOpen: () => Promise<OpenProjectResult | null>
    openPath: (projectPath: string) => Promise<OpenProjectResult>
    save: (input: SaveProjectRequest) => Promise<SaveProjectResult>
  }
  assets: {
    import: (input: ImportAssetsRequest) => Promise<ImportAssetsResult | null>
    relink: (input: RelinkAssetRequest) => Promise<AssetRecord | null>
    url: (
      projectId: string,
      assetId: string,
      quality?: 'thumbnail' | 'preview' | 'print' | 'original',
      usage?: { width?: number; height?: number }
    ) => string
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
