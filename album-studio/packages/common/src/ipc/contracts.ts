import { z } from "zod";
import {
  AlbumProjectSchema,
  AssetRecordSchema,
  MigrationIssueSchema,
  ThemeIdSchema,
  type AssetRecord,
  type ThemeId,
} from "../project/schema";

export const IPC_CHANNELS = {
  projectsListRecent: "projects:list-recent",
  projectsCreate: "projects:create",
  projectsChooseAndOpen: "projects:choose-and-open",
  projectsOpenPath: "projects:open-path",
  projectsSave: "projects:save",
  assetsImport: "assets:import",
  assetsRelink: "assets:relink",
  legacyChooseAndInspect: "legacy:choose-and-inspect",
  legacyCommit: "legacy:commit",
  exportPdf: "export:pdf",
  appCloseRequest: "app:close-request",
  appCloseReady: "app:close-ready",
} as const;

export const RecentProjectSchema = z.object({
  id: z.string(),
  title: z.string(),
  path: z.string(),
  updatedAt: z.string(),
  themeId: ThemeIdSchema,
  missing: z.boolean().default(false),
});
export type RecentProject = z.infer<typeof RecentProjectSchema>;

export const OpenProjectResultSchema = z.object({
  projectPath: z.string(),
  project: AlbumProjectSchema,
});
export type OpenProjectResult = z.infer<typeof OpenProjectResultSchema>;

export const SaveProjectRequestSchema = z.object({
  projectPath: z.string(),
  project: AlbumProjectSchema,
});
export type SaveProjectRequest = z.infer<typeof SaveProjectRequestSchema>;

export const SaveProjectResultSchema = z.object({
  revision: z.number().int().nonnegative(),
  savedAt: z.string(),
});
export type SaveProjectResult = z.infer<typeof SaveProjectResultSchema>;

export const ImportAssetsRequestSchema = z.object({
  projectPath: z.string(),
  source: z.enum(["files", "folder"]),
});

export const ImportAssetsResultSchema = z.object({
  assets: z.array(AssetRecordSchema),
  duplicateAssetIds: z.array(z.string()),
  skipped: z.array(z.object({ fileName: z.string(), reason: z.string() })),
});
export type ImportAssetsResult = z.infer<typeof ImportAssetsResultSchema>;

export const RelinkAssetRequestSchema = z.object({
  projectPath: z.string().min(1),
  assetId: z.string().min(1),
});
export type RelinkAssetRequest = z.infer<typeof RelinkAssetRequestSchema>;

export const LegacyInspectionSchema = z.object({
  inspectionId: z.string(),
  sourceName: z.string(),
  sourceKind: z.enum(["legacy-json", "legacy-html"]),
  schemaVersion: z.union([z.literal(2), z.literal(4)]),
  title: z.string(),
  placementCount: z.number().int().nonnegative(),
  estimatedPageCount: z.number().int().nonnegative(),
  issues: z.array(MigrationIssueSchema),
});
export type LegacyInspection = z.infer<typeof LegacyInspectionSchema>;

export const LegacyCommitRequestSchema = z.object({
  inspectionId: z.string(),
  themeFallback: ThemeIdSchema.default("journal"),
});

export const ExportPdfRequestSchema = z.object({
  projectPath: z.string(),
  suggestedName: z.string().min(1),
  revision: z.number().int().nonnegative(),
});
export type ExportPdfRequest = z.infer<typeof ExportPdfRequestSchema>;

export const ExportPdfResultSchema = z.object({
  path: z.string(),
  byteSize: z.number().int().positive(),
});
export type ExportPdfResult = z.infer<typeof ExportPdfResultSchema>;

export type AlbumStudioApi = {
  projects: {
    listRecent: () => Promise<RecentProject[]>;
    create: (input: {
      title: string;
      themeId: ThemeId;
    }) => Promise<OpenProjectResult | null>;
    chooseAndOpen: () => Promise<OpenProjectResult | null>;
    openPath: (projectPath: string) => Promise<OpenProjectResult>;
    save: (input: SaveProjectRequest) => Promise<SaveProjectResult>;
  };
  assets: {
    import: (
      input: z.infer<typeof ImportAssetsRequestSchema>,
    ) => Promise<ImportAssetsResult | null>;
    relink: (input: RelinkAssetRequest) => Promise<AssetRecord | null>;
    url: (
      projectId: string,
      assetId: string,
      quality?: "preview" | "print" | "original",
    ) => string;
  };
  legacy: {
    chooseAndInspect: () => Promise<LegacyInspection | null>;
    commit: (
      input: z.infer<typeof LegacyCommitRequestSchema>,
    ) => Promise<OpenProjectResult | null>;
  };
  export: {
    pdf: (input: ExportPdfRequest) => Promise<ExportPdfResult | null>;
  };
  system: {
    platform: NodeJS.Platform;
    versions: { electron: string; chrome: string; node: string };
    onCloseRequest: (listener: () => void) => () => void;
    closeReady: (input: { ok: boolean; error?: string }) => Promise<void>;
  };
};
