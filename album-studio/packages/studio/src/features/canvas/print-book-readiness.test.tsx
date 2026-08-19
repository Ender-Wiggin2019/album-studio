import {
  createAlbumDocument,
  createContentPage,
  createImageBlock,
  type AlbumDocument,
  type AssetRecord
} from '@album-studio/common'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import { PrintBook } from './album-page-view'

const beautifyImageSource = vi.hoisted(() => vi.fn())

vi.mock('@/shared/beauty/beautify-image-source', () => ({
  beautifyImageSource
}))

const asset: AssetRecord = {
  id: 'asset-print',
  fileName: '打印照片.jpg',
  contentHash: 'a'.repeat(64),
  mimeType: 'image/jpeg',
  byteSize: 1_024,
  width: 1_600,
  height: 1_200,
  importedAt: '2026-08-19T12:00:00.000Z'
}

function printDocument(): AlbumDocument {
  const document = createAlbumDocument({ title: '打印就绪测试' })
  document.assets.push(asset)
  const page = createContentPage(() => 'page-print')
  const block = createImageBlock(
    asset.id,
    { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotationDeg: 0 },
    () => 'block-print'
  )
  block.effects.clarity = 0.5
  page.blocks.push(block)
  document.pages.push(page)
  return document
}

function platform(getSource = vi.fn().mockResolvedValue('blob:print-source')): StudioPlatform {
  return {
    assets: { getSource, releaseSource: vi.fn() }
  } as unknown as StudioPlatform
}

beforeEach(() => {
  vi.useFakeTimers()
  beautifyImageSource.mockReset()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PrintBook readiness', () => {
  it('is immediately ready when the book has no image Blocks', async () => {
    const onReady = vi.fn()
    render(
      <StudioPlatformProvider platform={platform()}>
        <PrintBook document={createAlbumDocument({ title: '纯文字相册' })} onReady={onReady} />
      </StudioPlatformProvider>
    )

    await act(async () => undefined)
    expect(onReady).toHaveBeenCalledWith({ totalImages: 0, fallbackCount: 0 })
  })

  it('waits for a delayed print enhancement and the final image decode', async () => {
    beautifyImageSource.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          window.setTimeout(() => resolve('blob:enhanced-print-source'), 500)
        })
    )
    const onReady = vi.fn()
    render(
      <StudioPlatformProvider platform={platform()}>
        <PrintBook document={printDocument()} onReady={onReady} />
      </StudioPlatformProvider>
    )

    await act(async () => undefined)
    const image = screen.getByAltText('打印照片.jpg') as HTMLImageElement
    const decode = vi.fn<() => Promise<void>>()
    let finishDecode: (() => void) | undefined
    decode.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishDecode = resolve
        })
    )
    Object.defineProperty(image, 'decode', { configurable: true, value: decode })

    fireEvent.load(image)
    await act(async () => vi.advanceTimersByTime(120 + 499))
    expect(onReady).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTime(1))
    expect(image).toHaveAttribute('src', 'blob:enhanced-print-source')
    fireEvent.load(image)
    expect(decode).toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()

    await act(async () => finishDecode?.())
    expect(onReady).toHaveBeenCalledWith({ totalImages: 1, fallbackCount: 0 })
  })

  it('settles with an explicit original-image fallback when enhancement fails', async () => {
    let failEnhancement: ((error: Error) => void) | undefined
    beautifyImageSource.mockImplementation(
      () =>
        new Promise<string>((_resolve, reject) => {
          failEnhancement = reject
        })
    )
    const onReady = vi.fn()
    render(
      <StudioPlatformProvider platform={platform()}>
        <PrintBook document={printDocument()} onReady={onReady} />
      </StudioPlatformProvider>
    )

    await act(async () => undefined)
    await act(async () => vi.advanceTimersByTime(120))
    const image = screen.getByAltText('打印照片.jpg') as HTMLImageElement
    const decode = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(image, 'decode', { configurable: true, value: decode })
    fireEvent.load(image)
    expect(onReady).not.toHaveBeenCalled()

    await act(async () => failEnhancement?.(new Error('增强失败')))
    expect(onReady).toHaveBeenCalledWith({ totalImages: 1, fallbackCount: 1 })
  })

  it('waits until every print image has loaded', async () => {
    beautifyImageSource.mockResolvedValue('blob:enhanced-print-source')
    const document = printDocument()
    const page = document.pages.at(-1)
    if (!page) throw new Error('缺少打印页')
    const second = createImageBlock(
      asset.id,
      { x: 0.1, y: 0.1, width: 0.8, height: 0.8, rotationDeg: 0 },
      () => 'block-print-second'
    )
    second.effects.clarity = 0.5
    page.blocks.push(second)
    const onReady = vi.fn()
    render(
      <StudioPlatformProvider platform={platform()}>
        <PrintBook document={document} onReady={onReady} />
      </StudioPlatformProvider>
    )

    await act(async () => undefined)
    await act(async () => vi.advanceTimersByTime(120))
    expect(beautifyImageSource).toHaveBeenCalledTimes(1)
    const images = screen.getAllByAltText('打印照片.jpg') as HTMLImageElement[]
    for (const image of images) {
      Object.defineProperty(image, 'decode', {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined)
      })
    }

    fireEvent.load(images[0])
    await act(async () => undefined)
    expect(onReady).not.toHaveBeenCalled()

    fireEvent.load(images[1])
    await act(async () => undefined)
    expect(onReady).toHaveBeenCalledWith({ totalImages: 2, fallbackCount: 0 })
  })

  it('does not wait forever for a missing asset record', async () => {
    const document = printDocument()
    document.assets.length = 0
    const onReady = vi.fn()

    render(
      <StudioPlatformProvider platform={platform()}>
        <PrintBook document={document} onReady={onReady} />
      </StudioPlatformProvider>
    )

    await act(async () => undefined)
    expect(onReady).toHaveBeenCalledWith({ totalImages: 1, fallbackCount: 1 })
  })
})
