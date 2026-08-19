import { describe, expect, it } from 'vitest'
import { buildPageReorderCommand, PAGE_SORT_TYPE } from './page-sort'

describe('buildPageReorderCommand', () => {
  const sourceData = { kind: 'page-sort' as const, pageId: 'page-2' }

  it('只在有效的内容页索引发生变化时生成一次排序命令', () => {
    expect(
      buildPageReorderCommand({
        canceled: false,
        sourceData,
        sourceType: PAGE_SORT_TYPE,
        initialIndex: 2,
        currentIndex: 1,
        pageCount: 4
      })
    ).toEqual({ type: 'reorder-page', pageId: 'page-2', toIndex: 1 })
  })

  it('React 重渲染重置 currentIndex 时以 dnd-kit 已排序的 DOM 顺序为准', () => {
    expect(
      buildPageReorderCommand({
        canceled: false,
        sourceData,
        sourceType: PAGE_SORT_TYPE,
        initialIndex: 1,
        currentIndex: 1,
        pageCount: 3,
        optimisticPageIds: ['cover', 'page-1', 'page-2']
      })
    ).toEqual({ type: 'reorder-page', pageId: 'page-2', toIndex: 2 })
  })

  it.each([
    { label: '取消', canceled: true, initialIndex: 2, currentIndex: 1 },
    { label: '位置未变', canceled: false, initialIndex: 2, currentIndex: 2 },
    { label: '试图移到封面', canceled: false, initialIndex: 2, currentIndex: 0 },
    { label: '索引越界', canceled: false, initialIndex: 2, currentIndex: 4 }
  ])('$label 时不生成命令', ({ canceled, initialIndex, currentIndex }) => {
    expect(
      buildPageReorderCommand({
        canceled,
        sourceData,
        sourceType: PAGE_SORT_TYPE,
        initialIndex,
        currentIndex,
        pageCount: 4
      })
    ).toBeNull()
  })

  it('忽略其它拖拽类型和不完整数据', () => {
    expect(
      buildPageReorderCommand({
        canceled: false,
        sourceData: { kind: 'asset', assetId: 'asset-1' },
        sourceType: 'album-block-source',
        initialIndex: 2,
        currentIndex: 1,
        pageCount: 4
      })
    ).toBeNull()
  })
})
