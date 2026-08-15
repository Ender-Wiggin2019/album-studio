import { z } from "zod";

export const PROJECT_SCHEMA_VERSION = 1 as const;

const DEFAULT_TEXT_STYLE = {
  fontFamily: "serif" as const,
  fontSize: 13,
  color: "#201f1b",
  align: "left" as const,
  weight: "400" as const,
  lineHeight: 1.6,
};

const DEFAULT_PHOTO_PRESENTATION = {
  fit: "contain" as const,
  crop: { x: 0, y: 0 },
  scale: 1,
  rotationDeg: 0,
  flipX: false,
  flipY: false,
};

const DEFAULT_FILTERS = { brightness: 1, contrast: 1, saturation: 1 };

export const ThemeIdSchema = z.enum(["journal", "postcard", "film"]);
export type ThemeId = z.infer<typeof ThemeIdSchema>;

export const PageSpecSchema = z.object({
  widthMm: z.literal(297),
  heightMm: z.literal(210),
});

export const RectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});
export type Rect = z.infer<typeof RectSchema>;

export const TextStyleSchema = z.object({
  fontFamily: z.enum(["serif", "sans", "handwritten", "mono"]).default("serif"),
  fontSize: z.number().min(8).max(96).default(13),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#201f1b"),
  align: z.enum(["left", "center", "right"]).default("left"),
  weight: z.enum(["400", "500", "600", "700"]).default("400"),
  lineHeight: z.number().min(1).max(2.5).default(1.6),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const PhotoPresentationSchema = z.object({
  fit: z.enum(["contain", "cover"]).default("contain"),
  crop: z
    .object({
      x: z.number().min(-100).max(100).default(0),
      y: z.number().min(-100).max(100).default(0),
    })
    .default({ x: 0, y: 0 }),
  scale: z.number().min(0.25).max(5).default(1),
  rotationDeg: z.number().min(-360).max(360).default(0),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
});
export type PhotoPresentation = z.infer<typeof PhotoPresentationSchema>;

export const PhotoFiltersSchema = z.object({
  brightness: z.number().min(0).max(2).default(1),
  contrast: z.number().min(0).max(2).default(1),
  saturation: z.number().min(0).max(2).default(1),
});
export type PhotoFilters = z.infer<typeof PhotoFiltersSchema>;

export const MaskIdSchema = z.enum([
  "rectangle",
  "rounded",
  "circle",
  "arch",
  "paper-edge",
  "postage",
  "film-frame",
]);
export type MaskId = z.infer<typeof MaskIdSchema>;

export const CaptionSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().max(500).default(""),
  style: TextStyleSchema.default(DEFAULT_TEXT_STYLE),
});

export const PhotoSlotSchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1).nullable(),
  frame: RectSchema,
  media: PhotoPresentationSchema.default(DEFAULT_PHOTO_PRESENTATION),
  filters: PhotoFiltersSchema.default(DEFAULT_FILTERS),
  maskId: MaskIdSchema.default("rectangle"),
  caption: CaptionSchema.default({
    enabled: false,
    text: "",
    style: DEFAULT_TEXT_STYLE,
  }),
});
export type PhotoSlot = z.infer<typeof PhotoSlotSchema>;

export const PageNoteSchema = z.object({
  enabled: z.boolean().default(false),
  text: z.string().max(1000).default(""),
  style: TextStyleSchema.default({
    ...DEFAULT_TEXT_STYLE,
    fontSize: 18,
    align: "center",
    weight: "600",
  }),
});

export const CoverPageSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("cover"),
  title: z.string().max(160),
  subtitle: z.string().max(300).default(""),
  dateLabel: z.string().max(80).default(""),
  heroAssetId: z.string().min(1).nullable().default(null),
  heroPresentation: PhotoPresentationSchema.default({
    ...DEFAULT_PHOTO_PRESENTATION,
    fit: "cover",
  }),
});
export type CoverPage = z.infer<typeof CoverPageSchema>;

export const ContentPageSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("content"),
  layoutId: z.string().min(1),
  slots: z.array(PhotoSlotSchema).min(1).max(6),
  note: PageNoteSchema.default({
    enabled: false,
    text: "",
    style: {
      ...DEFAULT_TEXT_STYLE,
      fontSize: 18,
      align: "center",
      weight: "600",
    },
  }),
});
export type ContentPage = z.infer<typeof ContentPageSchema>;

export const AlbumPageSchema = z.discriminatedUnion("kind", [
  CoverPageSchema,
  ContentPageSchema,
]);
export type AlbumPage = z.infer<typeof AlbumPageSchema>;

export const AssetRecordSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().nonnegative(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  originalRelativePath: z.string().min(1),
  previewRelativePath: z.string().min(1).optional(),
  printRelativePath: z.string().min(1).optional(),
  importedAt: z.string().datetime(),
});
export type AssetRecord = z.infer<typeof AssetRecordSchema>;

export const MigrationIssueSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
  itemIndex: z.number().int().nonnegative().optional(),
});
export type MigrationIssue = z.infer<typeof MigrationIssueSchema>;

export const ProjectOriginSchema = z.object({
  kind: z.enum(["legacy-json", "legacy-html"]),
  schemaVersion: z.union([z.literal(2), z.literal(4)]),
  sourceUpdatedAt: z.string().optional(),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
  importedAt: z.string().datetime(),
  warnings: z.array(MigrationIssueSchema).default([]),
});

export const AlbumProjectSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
    id: z.string().min(1),
    revision: z.number().int().nonnegative(),
    title: z.string().min(1).max(160),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    themeId: ThemeIdSchema,
    pageSpec: PageSpecSchema,
    defaultPhotosPerPage: z.number().int().min(1).max(6),
    assets: z.array(AssetRecordSchema),
    pages: z.array(AlbumPageSchema).min(1),
    origin: ProjectOriginSchema.optional(),
  })
  .superRefine((project, context) => {
    if (project.pages[0]?.kind !== "cover") {
      context.addIssue({
        code: "custom",
        message: "项目第一页必须是封面",
        path: ["pages", 0],
      });
    }

    const assetIds = new Set(project.assets.map((asset) => asset.id));
    for (const [pageIndex, page] of project.pages.entries()) {
      if (
        page.kind === "cover" &&
        page.heroAssetId &&
        !assetIds.has(page.heroAssetId)
      ) {
        context.addIssue({
          code: "custom",
          message: "封面引用了不存在的素材",
          path: ["pages", pageIndex, "heroAssetId"],
        });
      }
      if (page.kind === "content") {
        for (const [slotIndex, slot] of page.slots.entries()) {
          if (slot.assetId && !assetIds.has(slot.assetId)) {
            context.addIssue({
              code: "custom",
              message: "页面引用了不存在的素材",
              path: ["pages", pageIndex, "slots", slotIndex, "assetId"],
            });
          }
        }
      }
    }
  });

export type AlbumProject = z.infer<typeof AlbumProjectSchema>;

export function validateAlbumProject(input: unknown): AlbumProject {
  return AlbumProjectSchema.parse(input);
}
