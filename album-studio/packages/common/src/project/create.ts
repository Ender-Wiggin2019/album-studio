import { getLayoutTemplate } from "../layout/templates";
import type { AlbumProject, ContentPage, PhotoSlot, ThemeId } from "./schema";

export type IdFactory = () => string;

const defaultIdFactory: IdFactory = () => crypto.randomUUID();

export function createPhotoSlot(
  assetId: string | null,
  frame: PhotoSlot["frame"],
  idFactory: IdFactory = defaultIdFactory,
): PhotoSlot {
  return {
    id: idFactory(),
    assetId,
    frame,
    media: {
      fit: "cover",
      crop: { x: 0, y: 0 },
      scale: 1,
      rotationDeg: 0,
      flipX: false,
      flipY: false,
    },
    filters: { brightness: 1, contrast: 1, saturation: 1 },
    maskId: "rectangle",
    caption: {
      enabled: false,
      text: "",
      style: {
        fontFamily: "serif",
        fontSize: 13,
        color: "#201f1b",
        align: "left",
        weight: "400",
        lineHeight: 1.6,
      },
    },
  };
}

export function createContentPage(
  assetIds: readonly (string | null)[],
  idFactory: IdFactory = defaultIdFactory,
  legacy = false,
): ContentPage {
  const requestedCount = Math.min(6, Math.max(1, assetIds.length));
  const template = getLayoutTemplate(requestedCount, legacy);
  const values = assetIds.length ? assetIds.slice(0, 6) : [null];

  return {
    id: idFactory(),
    kind: "content",
    layoutId: template.id,
    slots: template.frames.map((slotFrame, index) =>
      createPhotoSlot(values[index] ?? null, slotFrame, idFactory),
    ),
    note: {
      enabled: false,
      text: "",
      style: {
        fontFamily: "serif",
        fontSize: 18,
        color: "#201f1b",
        align: "center",
        weight: "600",
        lineHeight: 1.6,
      },
    },
  };
}

export function createEmptyProject(
  input: { title: string; themeId?: ThemeId; now?: string },
  idFactory: IdFactory = defaultIdFactory,
): AlbumProject {
  const now = input.now ?? new Date().toISOString();
  const title = input.title.trim() || "未命名相册";

  return {
    schemaVersion: 1,
    id: idFactory(),
    revision: 0,
    title,
    createdAt: now,
    updatedAt: now,
    themeId: input.themeId ?? "journal",
    pageSpec: { widthMm: 297, heightMm: 210 },
    defaultPhotosPerPage: 4,
    assets: [],
    pages: [
      {
        id: idFactory(),
        kind: "cover",
        title,
        subtitle: "把值得记住的时刻，装订成册。",
        dateLabel: "",
        heroAssetId: null,
        heroPresentation: {
          fit: "cover",
          crop: { x: 0, y: 0 },
          scale: 1,
          rotationDeg: 0,
          flipX: false,
          flipY: false,
        },
      },
    ],
  };
}

export function paginateAssetIds(
  assetIds: readonly string[],
  pageSize: number,
  idFactory: IdFactory = defaultIdFactory,
): ContentPage[] {
  const normalizedSize = Math.min(6, Math.max(1, Math.round(pageSize)));
  const pages: ContentPage[] = [];
  for (let start = 0; start < assetIds.length; start += normalizedSize) {
    pages.push(
      createContentPage(
        assetIds.slice(start, start + normalizedSize),
        idFactory,
      ),
    );
  }
  return pages;
}
