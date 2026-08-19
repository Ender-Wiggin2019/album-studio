import { createAlbumDocument, type AssetRecord, type ImageErase } from '@album-studio/common'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { useStudioStore } from '@/app/store'
import { ErasePeopleWorkspace } from './erase-people-workspace'
import { fitErasePhotoSize } from './erase-people-geometry'

const asset: AssetRecord = {
  id: 'asset-1',
  fileName: '照片.jpg',
  contentHash: 'a'.repeat(64),
  mimeType: 'image/jpeg',
  byteSize: 1_024,
  width: 1_600,
  height: 1_200,
  importedAt: '2026-08-18T12:00:00.000Z'
}

let id = 0
const nextId = (): string => `id-${++id}`

function desktopPlatform(): StudioPlatform & {
  imageErase: { detect: ReturnType<typeof vi.fn>; apply: ReturnType<typeof vi.fn> }
} {
  const detect = vi.fn(async () => ({
    maskBase64: btoa('fake-mask'),
    width: 1600,
    height: 1200
  }))
  const apply = vi.fn(async () => ({ eraseKey: 'abc123def456', width: 1600, height: 1200 }))
  return {
    kind: 'desktop',
    capabilities: new Set([
      'folder-import',
      'native-pdf',
      'asset-relink',
      'durable-project-folder',
      'erase-people'
    ]),
    projects: {
      listRecent: vi.fn(async () => []),
      create: vi.fn(async () => null),
      chooseAndOpen: vi.fn(async () => null),
      open: vi.fn(async () => {
        throw new Error('测试不应打开项目')
      }),
      save: vi.fn(async () => ({ revision: 0, savedAt: '' }))
    },
    assets: {
      pickCandidates: vi.fn(async () => null),
      importCandidates: vi.fn(async () => null),
      releaseCandidates: vi.fn(),
      relink: vi.fn(async () => null),
      getSource: vi.fn(async () => 'blob:fake-source'),
      releaseSource: vi.fn()
    },
    export: { pdf: vi.fn(async () => null) },
    imageErase: { detect, apply },
    lifecycle: {
      onCloseRequest: vi.fn(() => () => undefined),
      closeReady: vi.fn(async () => undefined)
    }
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

function openImageDocument(): void {
  useStudioStore.getState().closeDocument()
  const store = useStudioStore.getState()
  store.openDocument(
    createAlbumDocument({ title: '消除测试', now: '2026-08-18T12:00:00.000Z' }, nextId)
  )
  store.dispatch({ type: 'register-assets', assets: [asset] })
  store.dispatch({ type: 'add-page', assetIds: [asset.id], layoutId: 'focus' })
  const page = useStudioStore.getState().document?.pages[1]
  const block = page?.blocks[0]
  if (!page || !block || block.type !== 'image') throw new Error('图片夹具不完整')
  store.selectBlock(page.id, block.id)
}

function setCurrentImageErase(erase: ImageErase): void {
  const store = useStudioStore.getState()
  const page = store.document?.pages[1]
  const block = page?.blocks[0]
  if (!page || !block || block.type !== 'image') throw new Error('图片夹具不完整')
  store.dispatch({
    type: 'set-image-erase',
    pageId: page.id,
    blockId: block.id,
    erase
  })
}

const initialManualErase: ImageErase = {
  autoDetect: false,
  strokes: [
    {
      mode: 'add',
      size: 0.06,
      points: [
        { x: 0.25, y: 0.25 },
        { x: 0.3, y: 0.3 }
      ]
    }
  ]
}

describe('fitErasePhotoSize', () => {
  it('竖图（2:3）在宽舞台上受高度限制，照片完整可见且比例不变', () => {
    const size = fitErasePhotoSize(1600 / 2400, 860, 516)
    expect(size).not.toBeNull()
    expect(size!.width / size!.height).toBeCloseTo(1600 / 2400, 5)
    expect(size!.height).toBeCloseTo(516, 5)
    expect(size!.width).toBeLessThanOrEqual(860)
  })

  it('横图（4:3）在宽舞台上受高度限制，照片完整可见且比例不变', () => {
    const size = fitErasePhotoSize(1600 / 1200, 860, 516)
    expect(size).not.toBeNull()
    expect(size!.width / size!.height).toBeCloseTo(1600 / 1200, 5)
    expect(size!.height).toBeCloseTo(516, 5)
    expect(size!.width).toBeCloseTo(688, 5)
  })

  it('宽幅图（16:9）受宽度限制，高度按比例收缩', () => {
    const size = fitErasePhotoSize(1600 / 900, 860, 516)
    expect(size).not.toBeNull()
    expect(size!.width / size!.height).toBeCloseTo(1600 / 900, 5)
    expect(size!.width).toBeCloseTo(860, 5)
    expect(size!.height).toBeCloseTo(483.75, 5)
  })

  it('极端竖图（600:4000）在矮舞台上缩得很窄，比例仍不变', () => {
    const size = fitErasePhotoSize(600 / 4000, 860, 516)
    expect(size).not.toBeNull()
    expect(size!.width / size!.height).toBeCloseTo(600 / 4000, 5)
    expect(size!.height).toBeCloseTo(516, 5)
    expect(size!.width).toBeLessThanOrEqual(860)
  })

  it('非法输入返回 null', () => {
    expect(fitErasePhotoSize(0, 860, 516)).toBeNull()
    expect(fitErasePhotoSize(-1, 860, 516)).toBeNull()
    expect(fitErasePhotoSize(1600 / 1200, 0, 516)).toBeNull()
    expect(fitErasePhotoSize(1600 / 1200, 860, 0)).toBeNull()
    expect(fitErasePhotoSize(Number.NaN, 860, 516)).toBeNull()
  })
})

describe('ErasePeopleWorkspace', () => {
  beforeEach(() => {
    // jsdom 没有 ResizeObserver（Slider 依赖）与 createImageBitmap
    /* eslint-disable @typescript-eslint/no-empty-function */
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
    /* eslint-enable @typescript-eslint/no-empty-function */
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1600, height: 1200, close: vi.fn() }) as unknown as ImageBitmap)
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('自动识别后应用消除，并在确认时只提交一个 set-image-erase 命令', async () => {
    openImageDocument()
    const user = userEvent.setup()
    const platform = desktopPlatform()
    const { detect, apply } = platform.imageErase
    const documentId = useStudioStore.getState().document?.id ?? ''
    render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    // 没有遮罩时不能应用
    expect(screen.getByRole('button', { name: '应用消除' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '自动识别人物' }))
    await waitFor(() => expect(detect).toHaveBeenCalledWith(documentId, 'asset-1'))

    await user.click(screen.getByRole('button', { name: '应用消除' }))
    await waitFor(() => expect(apply).toHaveBeenCalled())
    expect(apply).toHaveBeenCalledWith(documentId, 'asset-1', { autoDetect: true, strokes: [] })

    // 预览阶段：确认应用 → 一个命令写入文档并退出
    await waitFor(() => expect(screen.getByRole('button', { name: '确认应用' })).toBeVisible())
    await user.click(screen.getByRole('button', { name: '确认应用' }))
    const block = useStudioStore
      .getState()
      .document?.pages[1].blocks.find((candidate) => candidate.type === 'image')
    expect(block?.type).toBe('image')
    if (block?.type === 'image') {
      expect(block.erase).toEqual({ autoDetect: true, strokes: [] })
    }
    expect(useStudioStore.getState().exclusiveWorkspace).toBeNull()
  })

  it('返回修改不会写入文档，取消同样不写入', async () => {
    openImageDocument()
    const user = userEvent.setup()
    const platform = desktopPlatform()
    render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '自动识别人物' }))
    await waitFor(() => expect(platform.imageErase.detect).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: '应用消除' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '返回修改' })).toBeVisible())
    await user.click(screen.getByRole('button', { name: '返回修改' }))

    await user.click(screen.getByRole('button', { name: '取消' }))
    const block = useStudioStore
      .getState()
      .document?.pages[1].blocks.find((candidate) => candidate.type === 'image')
    expect(block?.type).toBe('image')
    if (block?.type === 'image') expect(block.erase).toBeUndefined()
  })

  it('处理期锁定所有遮罩修改入口', async () => {
    openImageDocument()
    setCurrentImageErase(initialManualErase)
    const user = userEvent.setup()
    const platform = desktopPlatform()
    const pendingApply = deferred<{ eraseKey: string; width: number; height: number }>()
    vi.mocked(platform.imageErase.apply).mockReturnValue(pendingApply.promise)
    render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '应用消除' }))
    await waitFor(() => expect(platform.imageErase.apply).toHaveBeenCalledTimes(1))

    expect(screen.getByRole('button', { name: '自动识别人物' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '涂刷' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '橡皮' })).toBeDisabled()
    expect(screen.getByRole('slider', { name: '笔刷大小' })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('button', { name: '撤销笔划' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '清除全部' })).toBeDisabled()
    expect(screen.getByLabelText('人物遮罩涂刷区域')).toHaveAttribute('aria-disabled', 'true')

    pendingApply.resolve({ eraseKey: 'abc123def456', width: 1600, height: 1200 })
    await screen.findByRole('button', { name: '确认应用' })
    expect(screen.queryByRole('button', { name: '清除全部' })).not.toBeInTheDocument()
  })

  it('确认时提交与 apply 相同的遮罩快照，忽略处理期才结束的笔划', async () => {
    openImageDocument()
    setCurrentImageErase(initialManualErase)
    const user = userEvent.setup()
    const platform = desktopPlatform()
    const pendingApply = deferred<{ eraseKey: string; width: number; height: number }>()
    vi.mocked(platform.imageErase.apply).mockReturnValue(pendingApply.promise)
    render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    const canvas = (await screen.findByLabelText('人物遮罩涂刷区域')) as HTMLCanvasElement
    Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() })
    vi.spyOn(canvas, 'getContext').mockReturnValue(null)
    vi.spyOn(canvas.parentElement!, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 400,
      height: 300,
      right: 410,
      bottom: 320,
      x: 10,
      y: 20,
      toJSON: () => undefined
    })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 210, clientY: 170 })
    await user.click(screen.getByRole('button', { name: '应用消除' }))
    await waitFor(() => expect(platform.imageErase.apply).toHaveBeenCalledTimes(1))
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 210, clientY: 170 })

    pendingApply.resolve({ eraseKey: 'abc123def456', width: 1600, height: 1200 })
    await user.click(await screen.findByRole('button', { name: '确认应用' }))

    const appliedSnapshot = platform.imageErase.apply.mock.calls[0][2]
    const block = useStudioStore
      .getState()
      .document?.pages[1].blocks.find((candidate) => candidate.type === 'image')
    expect(block?.type).toBe('image')
    if (block?.type === 'image') expect(block.erase).toEqual(appliedSnapshot)
  })

  it('单击画布也会提交一个可见的圆点笔划', async () => {
    openImageDocument()
    const user = userEvent.setup()
    const platform = desktopPlatform()
    render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    const canvas = (await screen.findByLabelText('人物遮罩涂刷区域')) as HTMLCanvasElement
    Object.defineProperty(canvas, 'setPointerCapture', { value: vi.fn() })
    vi.spyOn(canvas, 'getContext').mockReturnValue(null)
    vi.spyOn(canvas.parentElement!, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 400,
      height: 300,
      right: 410,
      bottom: 320,
      x: 10,
      y: 20,
      toJSON: () => undefined
    })

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 210, clientY: 170 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 210, clientY: 170 })
    await user.click(screen.getByRole('button', { name: '应用消除' }))

    await waitFor(() => expect(platform.imageErase.apply).toHaveBeenCalled())
    const erase = platform.imageErase.apply.mock.calls[0][2]
    expect(erase.strokes).toEqual([
      {
        mode: 'add',
        size: 0.06,
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.5, y: 0.5 }
        ]
      }
    ])
  })

  it('关闭自动遮罩时释放已创建的 ImageBitmap', async () => {
    openImageDocument()
    const user = userEvent.setup()
    const platform = desktopPlatform()
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1600, height: 1200, close }) as unknown as ImageBitmap)
    )
    render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '自动识别人物' }))
    const closeAuto = await screen.findByRole('button', { name: '已识别：关闭自动遮罩' })
    await user.click(closeAuto)

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('工作区关闭后释放迟到的 ImageBitmap，不再接管它', async () => {
    openImageDocument()
    const user = userEvent.setup()
    const platform = desktopPlatform()
    let resolveBitmap!: (bitmap: ImageBitmap) => void
    const pendingBitmap = new Promise<ImageBitmap>((resolve) => {
      resolveBitmap = resolve
    })
    const createBitmap = vi.fn(() => pendingBitmap)
    vi.stubGlobal('createImageBitmap', createBitmap)
    const { unmount } = render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '自动识别人物' }))
    await waitFor(() => expect(createBitmap).toHaveBeenCalledTimes(1))
    unmount()

    const close = vi.fn()
    await act(async () => {
      resolveBitmap({ width: 1600, height: 1200, close } as unknown as ImageBitmap)
      await pendingBitmap
    })

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('工作区关闭后释放迟到的消除预览源，不提交卸载后的状态', async () => {
    openImageDocument()
    const user = userEvent.setup()
    const platform = desktopPlatform()
    const latePreview = deferred<string>()
    vi.mocked(platform.assets.getSource)
      .mockResolvedValueOnce('blob:original')
      .mockReturnValueOnce(latePreview.promise)
    const { unmount } = render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '自动识别人物' }))
    await waitFor(() => expect(platform.imageErase.detect).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: '应用消除' }))
    await waitFor(() => expect(platform.assets.getSource).toHaveBeenCalledTimes(2))
    unmount()

    await act(async () => {
      latePreview.resolve('blob:late-preview')
      await latePreview.promise
    })

    expect(platform.assets.releaseSource).toHaveBeenCalledWith('blob:late-preview')
  })

  it('清空笔划会取消当前识别状态，并释放随后到达的 Bitmap', async () => {
    openImageDocument()
    const store = useStudioStore.getState()
    const page = store.document?.pages[1]
    const block = page?.blocks[0]
    if (!page || !block || block.type !== 'image') throw new Error('图片夹具不完整')
    store.dispatch({
      type: 'set-image-erase',
      pageId: page.id,
      blockId: block.id,
      erase: {
        autoDetect: false,
        strokes: [
          {
            mode: 'add',
            size: 0.06,
            points: [
              { x: 0.5, y: 0.5 },
              { x: 0.5, y: 0.5 }
            ]
          }
        ]
      }
    })
    const user = userEvent.setup()
    const platform = desktopPlatform()
    let resolveBitmap!: (bitmap: ImageBitmap) => void
    const pendingBitmap = new Promise<ImageBitmap>((resolve) => {
      resolveBitmap = resolve
    })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => pendingBitmap)
    )
    render(
      <StudioPlatformProvider platform={platform}>
        <ErasePeopleWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '自动识别人物' }))
    await waitFor(() => expect(createImageBitmap).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: '清除全部' }))
    expect(screen.queryByText('正在识别人物…')).not.toBeInTheDocument()

    const close = vi.fn()
    await act(async () => {
      resolveBitmap({ width: 1600, height: 1200, close } as unknown as ImageBitmap)
      await pendingBitmap
    })
    expect(close).toHaveBeenCalledTimes(1)
  })
})
