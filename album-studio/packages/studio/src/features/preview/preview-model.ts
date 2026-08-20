export type PreviewMode = 'single' | 'double'

export function buildPreviewPageGroups(
  pageCount: number,
  mode: PreviewMode
): readonly (readonly number[])[] {
  if (pageCount <= 0) return []
  if (mode === 'single') {
    return Array.from({ length: pageCount }, (_, index) => [index])
  }

  const groups: number[][] = [[0]]
  for (let index = 1; index < pageCount; index += 2) {
    groups.push(index + 1 < pageCount ? [index, index + 1] : [index])
  }
  return groups
}

export function findPreviewPageGroup(
  groups: readonly (readonly number[])[],
  pageIndex: number
): number {
  const groupIndex = groups.findIndex((group) => group.includes(pageIndex))
  return groupIndex >= 0 ? groupIndex : 0
}
