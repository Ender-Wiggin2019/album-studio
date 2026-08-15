import { z } from "zod";
import { getLayoutTemplate } from "../layout/templates";
import {
  createEmptyProject,
  createPhotoSlot,
  type IdFactory,
} from "../project/create";
import type {
  AlbumProject,
  AssetRecord,
  ContentPage,
  MigrationIssue,
  PhotoSlot,
  Rect,
  TextStyle,
  ThemeId,
} from "../project/schema";

const LegacyEditSchema = z
  .object({
    brightness: z.coerce.number().optional(),
    contrast: z.coerce.number().optional(),
    beauty: z.coerce.number().optional(),
    rotate: z.coerce.number().optional(),
    zoom: z.coerce.number().optional(),
    offsetX: z.coerce.number().optional(),
    offsetY: z.coerce.number().optional(),
    frameX: z.coerce.number().optional(),
    frameY: z.coerce.number().optional(),
  })
  .passthrough();

const LegacyTextStyleSchema = z
  .object({
    enabled: z.boolean().optional(),
    fontFamily: z.string().optional(),
    fontSize: z.coerce.number().optional(),
    color: z.string().optional(),
    align: z.string().optional(),
    weight: z.union([z.string(), z.number()]).optional(),
    lineHeight: z.coerce.number().optional(),
  })
  .passthrough();

const LegacyItemSchema = z
  .object({
    id: z.string().optional(),
    fileName: z.string().optional(),
    caption: z.string().optional(),
    dataUrl: z.string().optional(),
    src: z.string().optional(),
    naturalWidth: z.coerce.number().optional(),
    naturalHeight: z.coerce.number().optional(),
    isBlank: z.boolean().optional(),
    edit: LegacyEditSchema.optional(),
    captionStyle: LegacyTextStyleSchema.optional(),
  })
  .passthrough();

const LegacyPageNoteSchema = LegacyTextStyleSchema.extend({
  text: z.string().optional(),
});

const LegacyAlbumSchema = z
  .object({
    schemaVersion: z.union([z.literal(2), z.literal(4)]),
    updatedAt: z.string().optional(),
    title: z.string().optional(),
    theme: z.string().optional(),
    pageSize: z.unknown().optional(),
    photoPageSizes: z.array(z.unknown()).optional(),
    pageNotes: z.array(z.unknown()).optional(),
    items: z.array(LegacyItemSchema),
  })
  .passthrough();

export type LegacyAlbum = z.infer<typeof LegacyAlbumSchema>;
export type LegacyItem = z.infer<typeof LegacyItemSchema>;

export type LegacyPageDraft = {
  photoPageIndex: number;
  start: number;
  pageSize: number;
  items: LegacyItem[];
};

export type LegacyAssetBinding = {
  assetId: string | null;
};

export function parseLegacyAlbum(input: unknown): LegacyAlbum {
  return LegacyAlbumSchema.parse(input);
}

export function normalizeLegacyPageSize(value: unknown): number {
  const numeric = Math.round(Number(value) || 2);
  return Math.min(6, Math.max(1, numeric));
}

export function paginateLegacyItems(input: {
  items: LegacyItem[];
  defaultPageSize: unknown;
  photoPageSizes?: unknown[];
}): LegacyPageDraft[] {
  const defaultPageSize = normalizeLegacyPageSize(input.defaultPageSize);
  // loadData() first normalised every override. A sparse/null value therefore became 2.
  const overrides = (input.photoPageSizes ?? []).map(normalizeLegacyPageSize);
  const pages: LegacyPageDraft[] = [];
  let start = 0;
  let photoPageIndex = 0;

  while (start < input.items.length) {
    const pageSize = overrides[photoPageIndex] || defaultPageSize;
    const count = Math.min(pageSize, input.items.length - start);
    pages.push({
      photoPageIndex,
      start,
      pageSize,
      items: input.items.slice(start, start + count),
    });
    start += count;
    photoPageIndex += 1;
  }

  return pages;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function mapFontFamily(value: unknown): TextStyle["fontFamily"] {
  if (value === "sans" || value === "handwritten" || value === "mono")
    return value;
  return "serif";
}

function mapTextStyle(
  input: z.infer<typeof LegacyTextStyleSchema> | undefined,
  fallback: {
    enabled: boolean;
    fontSize: number;
    align: TextStyle["align"];
    weight: TextStyle["weight"];
  },
): { enabled: boolean; style: TextStyle } {
  const align = input?.align;
  const weight = String(input?.weight ?? fallback.weight);
  const color =
    input?.color && /^#[0-9a-f]{6}$/i.test(input.color)
      ? input.color
      : "#201f1b";
  return {
    enabled: input?.enabled ?? fallback.enabled,
    style: {
      fontFamily: mapFontFamily(input?.fontFamily),
      fontSize: clamp(Number(input?.fontSize ?? fallback.fontSize), 8, 96),
      color,
      align: align === "center" || align === "right" ? align : fallback.align,
      weight:
        weight === "500" || weight === "600" || weight === "700"
          ? weight
          : fallback.weight,
      lineHeight: clamp(Number(input?.lineHeight ?? 1.6), 1, 2.5),
    },
  };
}

export function mapLegacyPhotoEdit(
  item: LegacyItem,
  issues: MigrationIssue[],
  itemIndex: number,
  frame: Rect = { x: 0, y: 0, width: 1, height: 1 },
): Pick<PhotoSlot, "media" | "filters" | "caption"> {
  const edit = item.edit ?? {};
  const offsetX = Number(edit.offsetX ?? 0);
  const offsetY = Number(edit.offsetY ?? 0);
  const frameX = Number(edit.frameX ?? 0);
  const frameY = Number(edit.frameY ?? 0);

  if (frameX !== 0 || frameY !== 0) {
    issues.push({
      code: "LEGACY_FRAME_OFFSET_IGNORED",
      severity: "warning",
      message: "旧版未渲染 frameX/frameY，迁移时保持同样行为并忽略这两个值。",
      itemIndex,
    });
  }

  const caption = mapTextStyle(item.captionStyle, {
    enabled: false,
    fontSize: 13,
    align: "left",
    weight: "400",
  });

  return {
    media: {
      fit: "contain",
      crop: {
        x: clamp((offsetX / (1122 * frame.width)) * 100, -100, 100),
        y: clamp((offsetY / (794 * frame.height)) * 100, -100, 100),
      },
      scale: clamp(Number(edit.zoom ?? 100) / 100, 0.25, 5),
      rotationDeg: clamp(Number(edit.rotate ?? 0), -360, 360),
      flipX: false,
      flipY: false,
    },
    filters: {
      brightness: clamp(Number(edit.brightness ?? 100) / 100, 0, 2),
      contrast: clamp(Number(edit.contrast ?? 100) / 100, 0, 2),
      saturation: clamp((100 + Number(edit.beauty ?? 0)) / 100, 0, 2),
    },
    caption: {
      enabled: caption.enabled,
      text: item.caption ?? "",
      style: caption.style,
    },
  };
}

function mapTheme(theme: unknown, issues: MigrationIssue[]): ThemeId {
  if (theme === "journal" || theme === "postcard" || theme === "film")
    return theme;
  issues.push({
    code: "LEGACY_THEME_DEFAULTED",
    severity: "info",
    message: "旧相册没有可识别的主题，已使用“旅途手账”。",
  });
  return "journal";
}

export function buildProjectFromLegacy(input: {
  legacy: LegacyAlbum;
  assets: AssetRecord[];
  bindings: LegacyAssetBinding[];
  sourceKind: "legacy-json" | "legacy-html";
  sourceSha256: string;
  importedAt: string;
  idFactory?: IdFactory;
  initialIssues?: MigrationIssue[];
}): AlbumProject {
  const ids = input.idFactory ?? (() => crypto.randomUUID());
  const issues = [...(input.initialIssues ?? [])];
  const project = createEmptyProject(
    {
      title: input.legacy.title?.trim() || "导入的旧相册",
      themeId: mapTheme(input.legacy.theme, issues),
      now: input.importedAt,
    },
    ids,
  );
  const pages = paginateLegacyItems({
    items: input.legacy.items,
    defaultPageSize: input.legacy.pageSize,
    photoPageSizes: input.legacy.photoPageSizes,
  });

  const contentPages: ContentPage[] = pages.map((page) => {
    const template = getLayoutTemplate(page.items.length, true);
    const slots = page.items.map((item, pageItemIndex) => {
      const itemIndex = page.start + pageItemIndex;
      const binding = input.bindings[itemIndex];
      const mapped = mapLegacyPhotoEdit(
        item,
        issues,
        itemIndex,
        template.frames[pageItemIndex],
      );
      const slot = createPhotoSlot(
        binding?.assetId ?? null,
        template.frames[pageItemIndex],
        ids,
      );
      return { ...slot, ...mapped };
    });
    const rawNote = input.legacy.pageNotes?.[page.photoPageIndex];
    const parsedNote = LegacyPageNoteSchema.safeParse(rawNote);
    const noteStyle = mapTextStyle(
      parsedNote.success ? parsedNote.data : undefined,
      {
        enabled: false,
        fontSize: 18,
        align: "center",
        weight: "600",
      },
    );

    return {
      id: ids(),
      kind: "content",
      layoutId: template.id,
      slots,
      note: {
        enabled: noteStyle.enabled,
        text: parsedNote.success ? (parsedNote.data.text ?? "") : "",
        style: noteStyle.style,
      },
    };
  });

  project.defaultPhotosPerPage = normalizeLegacyPageSize(input.legacy.pageSize);
  project.assets = input.assets;
  project.pages = [project.pages[0], ...contentPages];
  project.origin = {
    kind: input.sourceKind,
    schemaVersion: input.legacy.schemaVersion,
    sourceUpdatedAt: input.legacy.updatedAt,
    sourceSha256: input.sourceSha256,
    importedAt: input.importedAt,
    warnings: issues,
  };
  return project;
}
