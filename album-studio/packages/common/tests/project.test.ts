import { describe, expect, it } from "vitest";
import {
  AlbumProjectSchema,
  buildProjectFromLegacy,
  createEmptyProject,
  normalizeLegacyPageSize,
  paginateLegacyItems,
  parseLegacyAlbum,
} from "../src";

function idFactory(): () => string {
  let value = 0;
  return () => `id-${++value}`;
}

describe("project schema", () => {
  it("creates a valid A4 landscape project with a cover", () => {
    const project = createEmptyProject(
      { title: " 夏日旅行 ", now: "2026-08-15T12:00:00.000Z" },
      idFactory(),
    );

    expect(project.title).toBe("夏日旅行");
    expect(project.pageSpec).toEqual({ widthMm: 297, heightMm: 210 });
    expect(project.pages[0].kind).toBe("cover");
    expect(AlbumProjectSchema.parse(project)).toEqual(project);
  });
});

describe("legacy pagination", () => {
  it("preserves blank slots when slicing v2 items", () => {
    const items = Array.from({ length: 7 }, (_, index) => ({
      id: `legacy-${index}`,
      fileName: index === 2 ? "" : `${index}.jpg`,
      dataUrl: index === 2 ? "" : "data:image/jpeg;base64,YQ==",
    }));
    const pages = paginateLegacyItems({ items, defaultPageSize: 4 });
    expect(pages.map((page) => page.items.length)).toEqual([4, 3]);
    expect(pages[0].items[2].dataUrl).toBe("");
  });

  it("normalises null v4 page overrides to the legacy default of two", () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      id: String(index),
    }));
    const pages = paginateLegacyItems({
      items,
      defaultPageSize: 4,
      photoPageSizes: [2, null, 6],
    });
    expect(pages.map((page) => page.items.length)).toEqual([2, 2, 6]);
    expect(normalizeLegacyPageSize(null)).toBe(2);
  });
});

describe("legacy mapping", () => {
  it("maps v2 edit values without enabling legacy captions", () => {
    const legacy = parseLegacyAlbum({
      schemaVersion: 2,
      updatedAt: "2026-06-29T00:00:00.000Z",
      title: "旧相册",
      pageSize: 4,
      items: [
        {
          id: "old-1",
          fileName: "one.jpg",
          dataUrl: "data:image/jpeg;base64,YQ==",
          caption: "旧说明",
          edit: { zoom: 115, brightness: 118, beauty: 4, offsetX: 56.1 },
        },
      ],
    });
    const project = buildProjectFromLegacy({
      legacy,
      assets: [
        {
          id: "asset-1",
          fileName: "one.jpg",
          contentHash: "a".repeat(64),
          mimeType: "image/jpeg",
          byteSize: 1,
          width: 1,
          height: 1,
          originalRelativePath: "assets/original/a.jpg",
          importedAt: "2026-08-15T12:00:00.000Z",
        },
      ],
      bindings: [{ assetId: "asset-1" }],
      sourceKind: "legacy-json",
      sourceSha256: "b".repeat(64),
      importedAt: "2026-08-15T12:00:00.000Z",
      idFactory: idFactory(),
    });
    const page = project.pages[1];
    expect(page.kind).toBe("content");
    if (page.kind !== "content") throw new Error("expected content page");
    expect(page.slots[0].media.scale).toBe(1.15);
    expect(page.slots[0].media.crop.x).toBeCloseTo(
      (56.1 / (1122 * page.slots[0].frame.width)) * 100,
    );
    expect(page.slots[0].filters).toMatchObject({
      brightness: 1.18,
      saturation: 1.04,
    });
    expect(page.slots[0].caption.enabled).toBe(false);
    expect(project.themeId).toBe("journal");
  });
});
