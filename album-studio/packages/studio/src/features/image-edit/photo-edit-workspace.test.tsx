import { createAlbumDocument, type AssetRecord, type AutoEnhanceResult } from '@album-studio/common'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudioPlatformProvider } from '@/app/platform/studio-platform-provider'
import type { StudioPlatform } from '@/app/platform/studio-platform'
import { useStudioStore } from '@/app/store'
import { autoEnhanceImageSource } from './auto-enhance-image-source'
import { PhotoEditWorkspace } from './photo-edit-workspace'

vi.mock('./auto-enhance-image-source')

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

function desktopPlatform(): StudioPlatform {
  return {
    kind: 'desktop',
    capabilities: new Set(['folder-import', 'native-pdf', 'asset-relink', 'durable-project-folder']),
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
    imageErase: {
      detect: vi.fn(async () => ({ maskBase64: btoa('fake-mask'), width: 1600, height: 1200 })),
      apply: vi.fn(async () => ({ eraseKey: 'abc123def456', width: 1600, height: 1200 }))
    },
    lifecycle: {
      onCloseRequest: vi.fn(() => () => undefined),
      closeReady: vi.fn(async () => undefined)
    }
  }
}

function openImageDocument(): void {
  useStudioStore.getState().closeDocument()
  const store = useStudioStore.getState()
  store.openDocument(
    createAlbumDocument({ title: '自动美化测试', now: '2026-08-18T12:00:00.000Z' }, nextId)
  )
  store.dispatch({ type: 'register-assets', assets: [asset] })
  store.dispatch({ type: 'add-page', assetIds: [asset.id], layoutId: 'focus' })
  const page = useStudioStore.getState().document?.pages[1]
  const block = page?.blocks[0]
  if (!page || !block || block.type !== 'image') throw new Error('图片夹具不完整')
  store.selectBlock(page.id, block.id)
}

describe('PhotoEditWorkspace 自动美化', () => {
  beforeEach(() => {
    // jsdom 没有 ResizeObserver（Slider/react-image-crop 依赖）
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
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useStudioStore.getState().closeDocument()
  })

  it('点击自动美化后把分析参数合并进草稿，应用到照片才写入文档', async () => {
    openImageDocument()
    const user = userEvent.setup()
    const auto: AutoEnhanceResult = { brightness: 1.2, contrast: 1.1, saturation: 1.15 }
    vi.mocked(autoEnhanceImageSource).mockResolvedValueOnce(auto)
    render(
      <StudioPlatformProvider platform={desktopPlatform()}>
        <PhotoEditWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '自动美化' }))
    await waitFor(() => expect(screen.getByText('1.20×')).toBeInTheDocument())
    expect(autoEnhanceImageSource).toHaveBeenCalledWith('blob:fake-source', {
      area: { x: 0, y: 0, width: 100, height: 100 },
      rotationDeg: 0,
      flipX: false,
      flipY: false
    })

    // 未点击"应用到照片"前，文档不被修改
    const before = useStudioStore
      .getState()
      .document?.pages[1].blocks.find((candidate) => candidate.type === 'image')
    expect(before?.type).toBe('image')
    if (before?.type === 'image') expect(before.effects.brightness).toBe(1)

    await user.click(screen.getByRole('button', { name: '应用到照片' }))
    const after = useStudioStore
      .getState()
      .document?.pages[1].blocks.find((candidate) => candidate.type === 'image')
    expect(after?.type).toBe('image')
    if (after?.type === 'image') {
      expect(after.effects.brightness).toBe(1.2)
      expect(after.effects.contrast).toBe(1.1)
      expect(after.effects.saturation).toBe(1.15)
    }
  })

  it('分析期间按钮禁用并显示"正在分析…"，完成后恢复', async () => {
    openImageDocument()
    const user = userEvent.setup()
    let resolveAnalysis!: (value: AutoEnhanceResult | null) => void
    vi.mocked(autoEnhanceImageSource).mockImplementationOnce(
      () =>
        new Promise<AutoEnhanceResult | null>((resolve) => {
          resolveAnalysis = resolve
        })
    )
    render(
      <StudioPlatformProvider platform={desktopPlatform()}>
        <PhotoEditWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '自动美化' }))
    const analyzing = screen.getByRole('button', { name: '正在分析…' })
    expect(analyzing).toBeDisabled()
    expect(screen.getByRole('button', { name: '应用到照片' })).toBeDisabled()

    resolveAnalysis({ brightness: 1.2, contrast: 1.1, saturation: 1.15 })
    await waitFor(() => expect(screen.getByRole('button', { name: '自动美化' })).toBeEnabled())
  })

  it('分析失败时保持原草稿不变', async () => {
    openImageDocument()
    const user = userEvent.setup()
    vi.mocked(autoEnhanceImageSource).mockResolvedValueOnce(null)
    render(
      <StudioPlatformProvider platform={desktopPlatform()}>
        <PhotoEditWorkspace />
      </StudioPlatformProvider>
    )

    await user.click(screen.getByRole('button', { name: '自动美化' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '自动美化' })).toBeEnabled())
    // 亮度滑块仍为默认值
    const brightnessField = screen.getByText('亮度').closest('div')
    expect(brightnessField?.querySelector('span')).toHaveTextContent('1.00×')
  })

  it('恢复已保存的裁剪区域，应用后裁剪区域与 Block 形状保持所见即所得', async () => {
    openImageDocument()
    const store = useStudioStore.getState()
    const page = store.document?.pages[1]
    const block = page?.blocks[0]
    if (!page || !block || block.type !== 'image') throw new Error('图片夹具不完整')
    const beforeTransform = { ...block.transform }

    // 4:3 原图（1600×1200）裁出 1:1 区域：宽 75% × 高 100%，Block 应重塑为正方形
    store.dispatch({
      type: 'update-image-edit',
      pageId: page.id,
      blockId: block.id,
      crop: {
        area: { x: 0, y: 0, width: 75, height: 100 },
        rotationDeg: 0,
        flipX: false,
        flipY: false
      }
    })
    const reshaped = useStudioStore.getState().document?.pages[1].blocks[0]
    if (!reshaped || reshaped.type !== 'image') throw new Error('重塑后的图片块缺失')
    expect(
      (reshaped.transform.width * 297) / (reshaped.transform.height * 210)
    ).toBeCloseTo(1, 6)

    const user = userEvent.setup()
    render(
      <StudioPlatformProvider platform={desktopPlatform()}>
        <PhotoEditWorkspace />
      </StudioPlatformProvider>
    )
    // 编辑器恢复已保存的裁剪框（75% × 100%）
    expect(reshaped.crop.area).toMatchObject({ width: 75, height: 100 })
    await user.click(screen.getByRole('button', { name: '应用到照片' }))

    const applied = useStudioStore.getState().document?.pages[1].blocks[0]
    if (!applied || applied.type !== 'image') throw new Error('应用后的图片块缺失')
    expect(applied.crop.area).toMatchObject({ x: 0, y: 0, width: 75, height: 100 })
    expect(applied.transform).toEqual(reshaped.transform)
    // 未改动时 Block 形状不再变化；真正裁剪前（完整原图）也不会扰动布局
    expect(applied.transform).not.toEqual(beforeTransform)
  })
})
