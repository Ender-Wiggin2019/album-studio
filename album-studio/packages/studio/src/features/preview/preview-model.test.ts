import { describe, expect, it } from 'vitest'
import { buildPreviewPageGroups, findPreviewPageGroup } from './preview-model'

describe('preview page groups', () => {
  it('单页模式按文档顺序逐页显示', () => {
    expect(buildPreviewPageGroups(4, 'single')).toEqual([[0], [1], [2], [3]])
  })

  it('双页模式让封面独立，随后按内容页组成跨页', () => {
    expect(buildPreviewPageGroups(5, 'double')).toEqual([[0], [1, 2], [3, 4]])
    expect(buildPreviewPageGroups(4, 'double')).toEqual([[0], [1, 2], [3]])
  })

  it('切换模式时可定位到仍包含当前页的分组', () => {
    const groups = buildPreviewPageGroups(6, 'double')

    expect(findPreviewPageGroup(groups, 0)).toBe(0)
    expect(findPreviewPageGroup(groups, 2)).toBe(1)
    expect(findPreviewPageGroup(groups, 5)).toBe(3)
    expect(findPreviewPageGroup(groups, 99)).toBe(0)
  })
})
