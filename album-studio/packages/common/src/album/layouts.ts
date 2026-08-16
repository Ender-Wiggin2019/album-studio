import type { AlbumPageKind, BlockTransform, PageLayoutId } from './schema'

export type PageLayoutSlot = Readonly<{
  accepts: 'image' | 'rich-text'
  transform: Readonly<BlockTransform>
}>

export type PageLayout = Readonly<{
  id: PageLayoutId
  name: string
  description: string
  supportedPageKinds: readonly AlbumPageKind[]
  slots: readonly PageLayoutSlot[]
}>

export type PageLayoutFilter = Readonly<{
  pageKind?: AlbumPageKind
  imageCount?: number
  richTextCount?: number
}>

function frame(x: number, y: number, width: number, height: number): Readonly<BlockTransform> {
  return Object.freeze({ x, y, width, height, rotationDeg: 0 })
}

function image(x: number, y: number, width: number, height: number): Readonly<PageLayoutSlot> {
  return Object.freeze({ accepts: 'image', transform: frame(x, y, width, height) })
}

function richText(x: number, y: number, width: number, height: number): Readonly<PageLayoutSlot> {
  return Object.freeze({ accepts: 'rich-text', transform: frame(x, y, width, height) })
}

function layout(input: PageLayout): PageLayout {
  return Object.freeze({
    ...input,
    supportedPageKinds: Object.freeze([...input.supportedPageKinds]),
    slots: Object.freeze([...input.slots])
  })
}

export const PAGE_LAYOUTS: readonly PageLayout[] = Object.freeze([
  layout({
    id: 'focus',
    name: '焦点大图',
    description: '一张照片成为整页视觉中心',
    supportedPageKinds: ['content'],
    slots: [image(0.06, 0.07, 0.88, 0.86)]
  }),
  layout({
    id: 'split-even',
    name: '左右对页',
    description: '两张照片等宽并列',
    supportedPageKinds: ['content'],
    slots: [image(0.05, 0.08, 0.425, 0.84), image(0.525, 0.08, 0.425, 0.84)]
  }),
  layout({
    id: 'editorial-three',
    name: '杂志主视觉',
    description: '左侧主图搭配右侧两张叙事图',
    supportedPageKinds: ['content'],
    slots: [
      image(0.05, 0.07, 0.56, 0.86),
      image(0.65, 0.07, 0.3, 0.405),
      image(0.65, 0.525, 0.3, 0.405)
    ]
  }),
  layout({
    id: 'triptych',
    name: '三联画',
    description: '三张照片等宽并列，适合连续镜头',
    supportedPageKinds: ['content'],
    slots: [image(0.05, 0.1, 0.28, 0.8), image(0.36, 0.1, 0.28, 0.8), image(0.67, 0.1, 0.28, 0.8)]
  }),
  layout({
    id: 'grid-four',
    name: '四宫格',
    description: '四张照片均衡排列',
    supportedPageKinds: ['content'],
    slots: [
      image(0.05, 0.07, 0.425, 0.405),
      image(0.525, 0.07, 0.425, 0.405),
      image(0.05, 0.525, 0.425, 0.405),
      image(0.525, 0.525, 0.425, 0.405)
    ]
  }),
  layout({
    id: 'mosaic-five',
    name: '故事拼贴',
    description: '两张主图与三张细节图组成故事页',
    supportedPageKinds: ['content'],
    slots: [
      image(0.05, 0.07, 0.425, 0.405),
      image(0.525, 0.07, 0.425, 0.405),
      image(0.05, 0.525, 0.266, 0.405),
      image(0.367, 0.525, 0.266, 0.405),
      image(0.684, 0.525, 0.266, 0.405)
    ]
  }),
  layout({
    id: 'contact-six',
    name: '六格胶片',
    description: '六张照片组成紧凑的联系表',
    supportedPageKinds: ['content'],
    slots: [
      image(0.05, 0.07, 0.266, 0.405),
      image(0.367, 0.07, 0.266, 0.405),
      image(0.684, 0.07, 0.266, 0.405),
      image(0.05, 0.525, 0.266, 0.405),
      image(0.367, 0.525, 0.266, 0.405),
      image(0.684, 0.525, 0.266, 0.405)
    ]
  }),
  layout({
    id: 'image-text-focus',
    name: '图文焦点',
    description: '一张主图搭配一段叙事文字',
    supportedPageKinds: ['content'],
    slots: [image(0.05, 0.08, 0.58, 0.84), richText(0.68, 0.18, 0.27, 0.64)]
  }),
  layout({
    id: 'two-image-story',
    name: '双图故事',
    description: '两张照片与一段文字讲述同一故事',
    supportedPageKinds: ['content'],
    slots: [
      image(0.05, 0.08, 0.44, 0.4),
      image(0.05, 0.52, 0.44, 0.4),
      richText(0.55, 0.16, 0.4, 0.68)
    ]
  }),
  layout({
    id: 'three-image-note',
    name: '三图手记',
    description: '三张照片搭配一段页面手记',
    supportedPageKinds: ['content'],
    slots: [
      image(0.05, 0.08, 0.42, 0.52),
      image(0.51, 0.08, 0.205, 0.32),
      image(0.745, 0.08, 0.205, 0.32),
      richText(0.51, 0.46, 0.44, 0.38)
    ]
  })
])

const layoutsById = new Map(PAGE_LAYOUTS.map((pageLayout) => [pageLayout.id, pageLayout]))

export function getPageLayout(layoutId: PageLayoutId): PageLayout {
  const pageLayout = layoutsById.get(layoutId)
  if (!pageLayout) throw new Error(`未知页面布局：${layoutId}`)
  return pageLayout
}

function slotCount(pageLayout: PageLayout, accepts: PageLayoutSlot['accepts']): number {
  return pageLayout.slots.filter((slot) => slot.accepts === accepts).length
}

export function listPageLayouts(filter: PageLayoutFilter = {}): readonly PageLayout[] {
  return PAGE_LAYOUTS.filter(
    (pageLayout) =>
      (filter.pageKind === undefined || pageLayout.supportedPageKinds.includes(filter.pageKind)) &&
      (filter.imageCount === undefined || slotCount(pageLayout, 'image') === filter.imageCount) &&
      (filter.richTextCount === undefined ||
        slotCount(pageLayout, 'rich-text') === filter.richTextCount)
  )
}
