import {
  PAGE_SPEC_PRESETS,
  createAlbumDocument,
  createContentPage,
  createDecorationBlock,
  createImageBlock,
  createRichTextBlock,
  createRichTextDocument,
  eraseKeyFor,
  type AlbumDocument,
  type AssetRecord,
  type BlockTransform,
  type ContentPage
} from '@album-studio/common'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import { AlbumPageView, PrintBook } from './album-page-view'

const TRANSFORMS = {
  text: { x: 0.1, y: 0.2, width: 0.4, height: 0.2, rotationDeg: -5 },
  decoration: { x: 0.6, y: 0.1, width: 0.15, height: 0.2, rotationDeg: 12 },
  image: { x: 0.2, y: 0.4, width: 0.5, height: 0.4, rotationDeg: 0 }
} as const satisfies Record<string, BlockTransform>

const asset: AssetRecord = {
  id: 'asset-1',
  fileName: '旅行照片.jpg',
  contentHash: 'a'.repeat(64),
  mimeType: 'image/jpeg',
  byteSize: 1_024,
  width: 1_600,
  height: 1_200,
  importedAt: '2026-08-16T12:00:00.000Z'
}

afterEach(cleanup)

function documentWithContentBlocks(): { document: AlbumDocument; page: ContentPage } {
  const document = createAlbumDocument({
    title: '渲染测试',
    now: '2026-08-16T12:00:00.000Z'
  })
  const page = createContentPage(() => 'page-content')
  page.blocks = [
    createRichTextBlock(createRichTextDocument('第一层'), TRANSFORMS.text, () => 'block-text'),
    createDecorationBlock(
      { kind: 'icon', resourceId: 'heart', color: '#a84835' },
      TRANSFORMS.decoration,
      () => 'block-decoration'
    )
  ]
  document.pages.push(page)
  return { document, page }
}

describe('AlbumPageView', () => {
  it('renders cover and content from their ordered blocks without type-specific page branches', () => {
    const { document, page } = documentWithContentBlocks()
    const view = render(<AlbumPageView document={document} page={document.pages[0]} />)

    expect(
      [...view.container.querySelectorAll<HTMLElement>('[data-block-id]')].map(
        (element) => element.dataset.blockId
      )
    ).toEqual(document.pages[0].blocks.map((block) => block.id))

    view.rerender(<AlbumPageView document={document} page={page} />)
    const blocks = [...view.container.querySelectorAll<HTMLElement>('[data-block-id]')]
    expect(blocks.map((element) => element.dataset.blockId)).toEqual([
      'block-text',
      'block-decoration'
    ])
    expect(blocks[0]).toHaveStyle({
      left: '10%',
      top: '20%',
      width: '40%',
      height: '20%',
      transform: 'rotate(-5deg)'
    })
  })

  it.each(PAGE_SPEC_PRESETS)('uses $presetId as the page aspect ratio', (pageSpec) => {
    const document = createAlbumDocument({ title: '页面比例', pageSpec })
    const { container } = render(<AlbumPageView document={document} page={document.pages[0]} />)

    expect(container.querySelector('.album-page')).toHaveStyle({
      aspectRatio: `${pageSpec.widthMm} / ${pageSpec.heightMm}`
    })
  })

  it.each(PAGE_SPEC_PRESETS)('prints $presetId at its physical millimeter size', (pageSpec) => {
    const document = createAlbumDocument({ title: '打印尺寸', pageSpec })
    const { container } = render(<PrintBook document={document} />)

    expect(container.querySelector('.print-book')).toHaveStyle({
      '--print-page-width': `${pageSpec.widthMm}mm`,
      '--print-page-height': `${pageSpec.heightMm}mm`
    })
    expect(container.querySelector('[data-page-spec-print-style]')).toHaveTextContent(
      `@page { size: ${pageSpec.widthMm}mm ${pageSpec.heightMm}mm; margin: 0; }`
    )
  })

  it('owns selection semantics on the common Block wrapper', () => {
    const { document, page } = documentWithContentBlocks()
    const onSelectBlock = vi.fn()
    render(
      <AlbumPageView
        document={document}
        page={page}
        selectedBlockId="block-text"
        interactive
        onSelectBlock={onSelectBlock}
      />
    )

    const block = screen.getByRole('button', { name: '选择文字' })
    expect(block).toHaveAttribute('data-block-id', 'block-text')
    expect(block).toHaveAttribute('data-selected', 'true')
    fireEvent.pointerDown(block)
    fireEvent.keyDown(block, { key: 'Enter' })
    expect(onSelectBlock).toHaveBeenNthCalledWith(1, 'block-text')
    expect(onSelectBlock).toHaveBeenNthCalledWith(2, 'block-text')
  })

  it('renders a matching transient rich-text draft without mutating the document', () => {
    const { document, page } = documentWithContentBlocks()
    const persistedDocument = page.blocks[0]
    const view = render(
      <AlbumPageView
        document={document}
        page={page}
        richTextDraft={{
          pageId: page.id,
          blockId: 'block-text',
          document: createRichTextDocument('正在输入的文字')
        }}
      />
    )

    expect(screen.getByText('正在输入的文字')).toBeVisible()
    expect(JSON.stringify(persistedDocument)).toContain('第一层')

    view.rerender(
      <AlbumPageView
        document={document}
        page={page}
        richTextDraft={{
          pageId: 'other-page',
          blockId: 'block-text',
          document: createRichTextDocument('不应显示')
        }}
      />
    )
    expect(view.getByText('第一层')).toBeVisible()
    expect(view.queryByText('不应显示')).not.toBeInTheDocument()
  })

  it('requests print images with Block page ratios through the shared AssetImage path', async () => {
    const getSource = vi.fn().mockResolvedValue('data:image/gif;base64,R0lGODlhAQABAAAAACw=')
    const platform = {
      assets: { getSource, releaseSource: vi.fn() }
    } as unknown as StudioPlatform
    const document = createAlbumDocument({ title: '图片请求' })
    document.assets.push(asset)
    const page = createContentPage(() => 'page-image')
    page.blocks.push(createImageBlock(asset.id, TRANSFORMS.image, () => 'block-image'))
    document.pages.push(page)

    render(
      <StudioPlatformProvider platform={platform}>
        <AlbumPageView document={document} page={page} quality="print" />
      </StudioPlatformProvider>
    )

    await waitFor(() =>
      expect(getSource).toHaveBeenCalledWith(document.id, asset.id, {
        quality: 'print',
        pageWidthRatio: 0.5,
        pageHeightRatio: 0.4,
        crop: page.blocks[0]?.type === 'image' ? page.blocks[0].crop : undefined
      })
    )
    expect(screen.getByAltText('旅行照片.jpg')).toHaveAttribute('loading', 'eager')
  })

  it('requests the erased variant for blocks with erase parameters', async () => {
    const getSource = vi.fn().mockResolvedValue('data:image/gif;base64,R0lGODlhAQABAAAAACw=')
    const platform = {
      assets: { getSource, releaseSource: vi.fn() }
    } as unknown as StudioPlatform
    const document = createAlbumDocument({ title: '消除渲染' })
    document.assets.push(asset)
    const page = createContentPage(() => 'page-erase')
    const block = createImageBlock(asset.id, TRANSFORMS.image, () => 'block-erase')
    block.erase = { autoDetect: true, strokes: [] }
    page.blocks.push(block)
    document.pages.push(page)

    render(
      <StudioPlatformProvider platform={platform}>
        <AlbumPageView document={document} page={page} />
      </StudioPlatformProvider>
    )

    await waitFor(() =>
      expect(getSource).toHaveBeenCalledWith(document.id, asset.id, {
        quality: 'erased',
        eraseKey: eraseKeyFor({ autoDetect: true, strokes: [] }),
        pageWidthRatio: 0.5,
        pageHeightRatio: 0.4
      })
    )
    expect(screen.getByAltText('旅行照片.jpg')).toBeVisible()
  })

  it('falls back to the base quality when the erased variant is missing', async () => {
    const getSource = vi
      .fn()
      .mockRejectedValueOnce(new Error('消除结果缓存缺失'))
      .mockResolvedValueOnce('data:image/gif;base64,R0lGODlhAQABAAAAACw=')
    const platform = {
      assets: { getSource, releaseSource: vi.fn() }
    } as unknown as StudioPlatform
    const document = createAlbumDocument({ title: '消除回退' })
    document.assets.push(asset)
    const page = createContentPage(() => 'page-erase-fallback')
    const block = createImageBlock(asset.id, TRANSFORMS.image, () => 'block-erase-fallback')
    block.erase = {
      autoDetect: false,
      strokes: [
        {
          mode: 'add',
          size: 0.05,
          points: [
            { x: 0.5, y: 0.5 },
            { x: 0.6, y: 0.5 }
          ]
        }
      ]
    }
    page.blocks.push(block)
    document.pages.push(page)

    render(
      <StudioPlatformProvider platform={platform}>
        <AlbumPageView document={document} page={page} />
      </StudioPlatformProvider>
    )

    await waitFor(() => expect(getSource).toHaveBeenCalledTimes(2))
    expect(getSource).toHaveBeenNthCalledWith(
      1,
      document.id,
      asset.id,
      expect.objectContaining({ quality: 'erased' })
    )
    expect(getSource).toHaveBeenNthCalledWith(
      2,
      document.id,
      asset.id,
      expect.objectContaining({ quality: 'preview' })
    )
    expect(screen.getByAltText('旅行照片.jpg')).toBeVisible()
    expect(screen.queryByText('图片文件不可用')).toBeNull()
  })

  it('reports a failed image source with the owning Block id', async () => {
    const platform = {
      assets: {
        getSource: vi.fn().mockRejectedValue(new Error('图片不可用')),
        releaseSource: vi.fn()
      }
    } as unknown as StudioPlatform
    const onSourceError = vi.fn()
    const document = createAlbumDocument({ title: '缺失图片' })
    document.assets.push(asset)
    const page = createContentPage(() => 'page-image-error')
    page.blocks.push(createImageBlock(asset.id, TRANSFORMS.image, () => 'block-image-error'))
    document.pages.push(page)

    render(
      <StudioPlatformProvider platform={platform}>
        <AlbumPageView
          document={document}
          page={page}
          quality="preview"
          onSourceError={onSourceError}
        />
      </StudioPlatformProvider>
    )

    await waitFor(() => expect(onSourceError).toHaveBeenCalledWith('block-image-error'))
  })
})
