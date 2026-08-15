import type { Rect } from "../project/schema";

export type LayoutTemplate = {
  id: string;
  name: string;
  frames: readonly Rect[];
};

const frame = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

export const LAYOUT_TEMPLATES: Readonly<Record<number, LayoutTemplate>> = {
  1: {
    id: "layout-1-hero",
    name: "满页单图",
    frames: [frame(0.04, 0.05, 0.92, 0.9)],
  },
  2: {
    id: "layout-2-editorial",
    name: "主图与侧图",
    frames: [frame(0.04, 0.05, 0.57, 0.9), frame(0.64, 0.05, 0.32, 0.9)],
  },
  3: {
    id: "layout-3-editorial",
    name: "主图与双图",
    frames: [
      frame(0.04, 0.05, 0.57, 0.9),
      frame(0.64, 0.05, 0.32, 0.43),
      frame(0.64, 0.52, 0.32, 0.43),
    ],
  },
  4: {
    id: "layout-4-grid",
    name: "四宫格",
    frames: [
      frame(0.04, 0.05, 0.44, 0.43),
      frame(0.52, 0.05, 0.44, 0.43),
      frame(0.04, 0.52, 0.44, 0.43),
      frame(0.52, 0.52, 0.44, 0.43),
    ],
  },
  5: {
    id: "layout-5-contact-sheet",
    name: "二上三下",
    frames: [
      frame(0.04, 0.05, 0.44, 0.43),
      frame(0.52, 0.05, 0.44, 0.43),
      frame(0.04, 0.52, 0.28, 0.43),
      frame(0.36, 0.52, 0.28, 0.43),
      frame(0.68, 0.52, 0.28, 0.43),
    ],
  },
  6: {
    id: "layout-6-grid",
    name: "六宫格",
    frames: [
      frame(0.04, 0.05, 0.28, 0.43),
      frame(0.36, 0.05, 0.28, 0.43),
      frame(0.68, 0.05, 0.28, 0.43),
      frame(0.04, 0.52, 0.28, 0.43),
      frame(0.36, 0.52, 0.28, 0.43),
      frame(0.68, 0.52, 0.28, 0.43),
    ],
  },
};

export const LEGACY_LAYOUT_TEMPLATES: Readonly<Record<number, LayoutTemplate>> =
  {
    1: {
      id: "legacy-fixed-1",
      name: "旧版单图",
      frames: [frame(0.004, 0.004, 0.992, 0.992)],
    },
    2: {
      id: "legacy-fixed-2",
      name: "旧版双图",
      frames: [
        frame(0.004, 0.004, 0.588, 0.992),
        frame(0.604, 0.004, 0.392, 0.992),
      ],
    },
    3: {
      id: "legacy-fixed-3",
      name: "旧版三图",
      frames: [
        frame(0.004, 0.004, 0.586, 0.992),
        frame(0.602, 0.004, 0.394, 0.49),
        frame(0.602, 0.506, 0.394, 0.49),
      ],
    },
    4: {
      id: "legacy-fixed-4",
      name: "旧版四图",
      frames: [
        frame(0.004, 0.004, 0.492, 0.492),
        frame(0.504, 0.004, 0.492, 0.492),
        frame(0.004, 0.504, 0.492, 0.492),
        frame(0.504, 0.504, 0.492, 0.492),
      ],
    },
    5: {
      id: "legacy-fixed-5",
      name: "旧版五图",
      frames: [
        frame(0.004, 0.004, 0.492, 0.49),
        frame(0.504, 0.004, 0.492, 0.49),
        frame(0.004, 0.506, 0.324, 0.49),
        frame(0.338, 0.506, 0.324, 0.49),
        frame(0.672, 0.506, 0.324, 0.49),
      ],
    },
    6: {
      id: "legacy-fixed-6",
      name: "旧版六图",
      frames: [
        frame(0.004, 0.004, 0.324, 0.49),
        frame(0.338, 0.004, 0.324, 0.49),
        frame(0.672, 0.004, 0.324, 0.49),
        frame(0.004, 0.506, 0.324, 0.49),
        frame(0.338, 0.506, 0.324, 0.49),
        frame(0.672, 0.506, 0.324, 0.49),
      ],
    },
  };

export function getLayoutTemplate(
  photoCount: number,
  legacy = false,
): LayoutTemplate {
  const count = Math.min(6, Math.max(1, Math.round(photoCount)));
  const template = (legacy ? LEGACY_LAYOUT_TEMPLATES : LAYOUT_TEMPLATES)[count];
  if (!template) throw new Error(`不支持 ${photoCount} 张照片的布局`);
  return template;
}
