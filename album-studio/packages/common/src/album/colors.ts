import { HexColorSchema, MAX_RECENT_COLORS, type HexColor, type RichTextDocument } from './schema'

export function mergeRecentColors(
  newestColors: readonly string[],
  existingColors: readonly string[] = []
): HexColor[] {
  const merged: HexColor[] = []
  for (const color of [...newestColors, ...existingColors]) {
    const normalized = HexColorSchema.parse(color).toLowerCase()
    if (!merged.includes(normalized)) merged.push(normalized)
    if (merged.length === MAX_RECENT_COLORS) break
  }
  return merged
}

export function collectRichTextColors(document: RichTextDocument): HexColor[] {
  const colors = document.root.children.flatMap((node) =>
    node.type === 'paragraph'
      ? node.children.map((child) => child.color)
      : node.children.flatMap((item) => item.children.map((child) => child.color))
  )
  return mergeRecentColors(colors)
}
