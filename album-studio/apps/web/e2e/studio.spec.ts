import { expect, test, type Page } from '@playwright/test'
import type { AlbumDocument, ContentPage, ImageBlock } from '@album-studio/common'

const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const LONG_PROJECT_TITLE = '浏览器持久化相册——夏日海边与家人旅行的最后一段记录'

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>
}

async function clearBrowserProjects(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    try {
      await root.removeEntry('album-studio', { recursive: true })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error
    }
  })
}

async function readOnlyManifest(page: Page): Promise<AlbumDocument> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const data = await root.getDirectoryHandle('album-studio')
    const projects = (await data.getDirectoryHandle('projects')) as IterableDirectoryHandle
    for await (const handle of projects.values()) {
      if (handle.kind !== 'directory') continue
      const project = await projects.getDirectoryHandle(handle.name)
      const manifest = await project.getFileHandle('manifest.json')
      return JSON.parse(await (await manifest.getFile()).text()) as AlbumDocument
    }
    throw new Error('浏览器中没有相册 manifest')
  })
}

function firstContentImageBlock(document: AlbumDocument): ImageBlock {
  const content = document.pages.find(
    (candidate): candidate is ContentPage => candidate.kind === 'content'
  )
  const block = content?.blocks.find(
    (candidate): candidate is ImageBlock => candidate.type === 'image'
  )
  if (!block) throw new Error('相册中没有可测试的图片 Block')
  return block
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await clearBrowserProjects(page)
  await page.reload()
})

test('浏览器离线版可导入、自由拖动、美化、自动保存、刷新恢复与打印', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await expect(page.getByText('浏览器离线版', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开相册文件夹' })).toHaveCount(0)

  await page.getByRole('button', { name: '新建相册' }).first().click()
  await page.getByLabel('相册名称').fill(LONG_PROJECT_TITLE)
  await page.getByRole('radio', { name: /海风明信片/ }).click()
  await page.getByRole('button', { name: '创建相册' }).click()
  await expect(page.locator('.project-identity')).toContainText(LONG_PROJECT_TITLE)

  await page.getByRole('tab', { name: /素材/ }).click()
  await expect(page.getByRole('heading', { name: '导入项目照片' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('browser-empty-assets-1440x900.png') })

  const invalidFileChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择图片' }).click()
  await (
    await invalidFileChooser
  ).setFiles({
    name: '无法解码的超长中文照片文件名.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not-a-png')
  })
  const skippedSummary = page.getByText('1 个文件未导入 · 查看详情')
  await expect(skippedSummary).toBeVisible()
  await skippedSummary.click()
  await expect(
    page.getByText('无法解码的超长中文照片文件名.png：图片无法解码或文件内容损坏')
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('browser-import-failure-1440x900.png') })

  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: '选择图片' }).click()
  await (
    await fileChooser
  ).setFiles({
    name: '浏览器测试照片.png',
    mimeType: 'image/png',
    buffer: TEST_PNG
  })
  const importedAssetSource = page.getByRole('button', {
    name: /添加 浏览器测试照片\.png 到当前页/
  })
  await expect(importedAssetSource).toBeVisible()
  const sourceBox = await importedAssetSource.boundingBox()
  const coverSheet = page.locator('.canvas-sheet')
  const coverSheetBox = await coverSheet.boundingBox()
  if (!sourceBox || !coverSheetBox) throw new Error('无法测量素材拖拽来源或封面画布')
  const dropPoint = {
    x: coverSheetBox.x + coverSheetBox.width * 0.76,
    y: coverSheetBox.y + coverSheetBox.height * 0.72
  }
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(dropPoint.x, dropPoint.y, { steps: 12 })
  await page.mouse.up()
  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const imageBlock = document.pages[0]?.blocks.find((block) => block.type === 'image')
      return imageBlock?.type === 'image'
        ? {
            count: document.pages[0].blocks.length,
            x: imageBlock.transform.x,
            y: imageBlock.transform.y
          }
        : null
    })
    .toMatchObject({ count: 4, x: expect.any(Number), y: expect.any(Number) })
  const droppedCover = await readOnlyManifest(page)
  const droppedCoverImage = droppedCover.pages[0]?.blocks.find((block) => block.type === 'image')
  if (!droppedCoverImage || droppedCoverImage.type !== 'image') {
    throw new Error('素材拖入没有创建 ImageBlock')
  }
  expect(droppedCoverImage.transform.x).toBeGreaterThan(0.45)
  expect(droppedCoverImage.transform.y).toBeGreaterThan(0.35)

  await page.getByRole('button', { name: '批量添加' }).click()
  await page.getByRole('button', { name: /自动创建新页/ }).click()
  await expect(page.getByText('第 1 页 · 1 个 Block', { exact: true })).toBeVisible()

  const image = page
    .getByRole('region', { name: '相册画布' })
    .getByRole('button', { name: '选择照片 浏览器测试照片.png' })
  await image.click()
  const moveable = page.locator('.moveable-control-box')
  await expect(moveable).toBeVisible()

  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const content = document.pages.find(
        (candidate): candidate is ContentPage => candidate.kind === 'content'
      )
      return content?.blocks.filter((block) => block.type === 'image').length ?? 0
    })
    .toBe(1)

  const canvas = page.getByRole('region', { name: '相册画布' })
  await page.getByRole('tab', { name: /组件/ }).click()
  await page.getByRole('button', { name: '添加文字' }).click()
  await canvas.getByRole('button', { name: '选择文字' }).click()
  const textEditor = page.getByRole('textbox', { name: '富文本内容' })
  await expect(textEditor).toBeVisible()
  await textEditor.fill('浏览器里的最后一段文字')
  await textEditor.selectText()
  await page.getByRole('button', { name: '粗体' }).click()
  await page.getByRole('radio', { name: '居中对齐' }).click()
  await page.getByRole('radio', { name: '项目符号列表' }).click()

  await page.getByRole('tab', { name: /组件/ }).click()
  await page.getByRole('button', { name: '旅行吊牌' }).click()
  await canvas.getByRole('button', { name: '选择贴纸' }).click()
  await expect(page.getByRole('tab', { name: /编辑/ })).toHaveAttribute('data-state', 'active')

  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const content = document.pages.find(
        (candidate): candidate is ContentPage => candidate.kind === 'content'
      )
      return content?.blocks.find(
        (block) => block.type === 'decoration' && block.decoration.kind === 'sticker'
      )
    })
    .toMatchObject({ decoration: { kind: 'sticker', resourceId: 'travel-tag' } })
  const beforeStickerReplacement = await readOnlyManifest(page)
  const beforeStickerPage = beforeStickerReplacement.pages.find(
    (candidate): candidate is ContentPage => candidate.kind === 'content'
  )
  const beforeSticker = beforeStickerPage?.blocks.find(
    (block) => block.type === 'decoration' && block.decoration.kind === 'sticker'
  )
  if (!beforeStickerPage || !beforeSticker) throw new Error('替换前缺少贴纸 Block')
  const beforeStickerIndex = beforeStickerPage.blocks.indexOf(beforeSticker)

  await page.getByRole('tab', { name: /组件/ }).click()
  await page.getByRole('button', { name: '和纸胶带' }).click()
  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const content = document.pages.find(
        (candidate): candidate is ContentPage => candidate.kind === 'content'
      )
      const sticker = content?.blocks.find((block) => block.id === beforeSticker.id)
      return sticker?.type === 'decoration' ? sticker.decoration.resourceId : null
    })
    .toBe('washi-tape')
  const afterStickerReplacement = await readOnlyManifest(page)
  const afterStickerPage = afterStickerReplacement.pages.find(
    (candidate): candidate is ContentPage => candidate.kind === 'content'
  )
  const afterSticker = afterStickerPage?.blocks.find((block) => block.id === beforeSticker.id)
  expect(afterSticker?.transform).toEqual(beforeSticker.transform)
  expect(afterStickerPage?.blocks.indexOf(afterSticker!)).toBe(beforeStickerIndex)

  await page.getByRole('button', { name: '爱心' }).click()
  await canvas.getByRole('button', { name: '选择图标' }).click()
  await page.getByLabel('图标颜色').fill('#356fc6')
  await page.getByRole('tab', { name: /布局/ }).click()
  await page.getByRole('button', { name: /图文焦点/ }).click()

  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const content = document.pages.find(
        (candidate): candidate is ContentPage => candidate.kind === 'content'
      )
      const text = content?.blocks.find((block) => block.type === 'rich-text')
      const icon = content?.blocks.find(
        (block) => block.type === 'decoration' && block.decoration.kind === 'icon'
      )
      return {
        blockCount: content?.blocks.length,
        layoutId: content?.layoutId,
        text: text?.type === 'rich-text' ? JSON.stringify(text.document) : '',
        iconColor:
          icon?.type === 'decoration' && icon.decoration.kind === 'icon'
            ? icon.decoration.color
            : null
      }
    })
    .toMatchObject({
      blockCount: 4,
      layoutId: 'image-text-focus',
      text: expect.stringContaining('浏览器里的最后一段文字'),
      iconColor: '#356fc6'
    })
  await expect(page.getByText('第 1 页 · 4 个 Block', { exact: true })).toBeVisible()

  await image.click()
  await expect(moveable).toBeVisible()
  await page.waitForTimeout(850)
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()

  const beforeResizeDocument = await readOnlyManifest(page)
  const beforeResizeBlock = firstContentImageBlock(beforeResizeDocument)
  const beforeResizeBox = await image.boundingBox()
  const resizeHandle = page.locator('.moveable-control.moveable-direction.moveable-se')
  const resizeHandleBox = await resizeHandle.boundingBox()
  expect(beforeResizeBox).not.toBeNull()
  expect(resizeHandleBox).not.toBeNull()
  if (!beforeResizeBox || !resizeHandleBox) throw new Error('无法测量照片或东南缩放柄')
  const resizeStart = {
    x: resizeHandleBox.x + resizeHandleBox.width / 2,
    y: resizeHandleBox.y + resizeHandleBox.height / 2
  }
  await page.mouse.move(resizeStart.x, resizeStart.y)
  await page.mouse.down()
  await expect(moveable).toBeVisible()
  await page.mouse.move(resizeStart.x - 1, resizeStart.y - 1)
  const firstResizeFrame = await image.boundingBox()
  expect(firstResizeFrame).not.toBeNull()
  if (!firstResizeFrame) throw new Error('无法测量照片缩放首帧')
  expect(firstResizeFrame.width).toBeGreaterThan(beforeResizeBox.width * 0.9)
  expect(firstResizeFrame.height).toBeGreaterThan(beforeResizeBox.height * 0.9)
  await page.mouse.move(resizeStart.x - 48, resizeStart.y - 12, { steps: 8 })
  await expect(moveable).toBeVisible()
  await page.mouse.up()
  await expect(moveable).toBeVisible()

  const afterResizeBox = await image.boundingBox()
  expect(afterResizeBox).not.toBeNull()
  if (!afterResizeBox) throw new Error('无法测量缩放后的照片')
  expect(afterResizeBox.x).toBeCloseTo(beforeResizeBox.x, 0)
  expect(afterResizeBox.y).toBeCloseTo(beforeResizeBox.y, 0)
  const resizeWidthDelta = beforeResizeBox.width - afterResizeBox.width
  expect(resizeWidthDelta).toBeGreaterThan(24)
  expect(resizeWidthDelta).toBeLessThan(60)
  expect(afterResizeBox.width / afterResizeBox.height).toBeCloseTo(
    beforeResizeBox.width / beforeResizeBox.height,
    2
  )

  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const block = firstContentImageBlock(document)
      return {
        revision: document.revision,
        widthSmaller: block.transform.width < beforeResizeBlock.transform.width,
        heightSmaller: block.transform.height < beforeResizeBlock.transform.height
      }
    })
    .toEqual({
      revision: beforeResizeDocument.revision + 1,
      widthSmaller: true,
      heightSmaller: true
    })

  const savedResizeBlock = firstContentImageBlock(await readOnlyManifest(page))
  const pageBox = await page.locator('.canvas-sheet .album-page').boundingBox()
  expect(pageBox).not.toBeNull()
  if (!pageBox) throw new Error('无法测量相册页面')
  expect(savedResizeBlock.transform.width * pageBox.width).toBeCloseTo(afterResizeBox.width, 0)
  expect(savedResizeBlock.transform.height * pageBox.height).toBeCloseTo(afterResizeBox.height, 0)

  await page.getByRole('button', { name: '放大' }).click()
  await page.waitForTimeout(250)
  await expect
    .poll(async () => {
      const imageBox = await image.boundingBox()
      const northWestBox = await page
        .locator('.moveable-control.moveable-direction.moveable-nw')
        .boundingBox()
      const southEastBox = await resizeHandle.boundingBox()
      if (!imageBox || !northWestBox || !southEastBox) return Number.POSITIVE_INFINITY
      return Math.max(
        Math.abs(northWestBox.x + northWestBox.width / 2 - imageBox.x),
        Math.abs(northWestBox.y + northWestBox.height / 2 - imageBox.y),
        Math.abs(southEastBox.x + southEastBox.width / 2 - (imageBox.x + imageBox.width)),
        Math.abs(southEastBox.y + southEastBox.height / 2 - (imageBox.y + imageBox.height))
      )
    })
    .toBeLessThan(2)

  await page.setViewportSize({ width: 800, height: 640 })
  const responsivePanel = page.getByRole('dialog', { name: '装帧托盘' })
  if (await responsivePanel.isVisible()) {
    await responsivePanel.getByRole('button', { name: '关闭' }).click()
  }
  await page.locator('.canvas-scroll').evaluate((scrollArea) => {
    scrollArea.scrollTop = scrollArea.scrollHeight
  })
  await page.waitForTimeout(50)
  const narrowResizeDocument = await readOnlyManifest(page)
  const narrowResizeBox = await image.boundingBox()
  const narrowResizeHandleBox = await resizeHandle.boundingBox()
  expect(narrowResizeBox).not.toBeNull()
  expect(narrowResizeHandleBox).not.toBeNull()
  if (!narrowResizeBox || !narrowResizeHandleBox) {
    throw new Error('无法测量窄窗口照片或东南缩放柄')
  }
  const narrowResizeStart = {
    x: narrowResizeHandleBox.x + narrowResizeHandleBox.width / 2,
    y: narrowResizeHandleBox.y + narrowResizeHandleBox.height / 2
  }
  await expect(
    page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('moveable-se') ?? false,
      narrowResizeStart
    )
  ).resolves.toBe(true)
  await page.mouse.move(narrowResizeStart.x, narrowResizeStart.y)
  await page.mouse.down()
  await page.mouse.move(narrowResizeStart.x - 1, narrowResizeStart.y - 1)
  const narrowFirstResizeFrame = await image.boundingBox()
  expect(narrowFirstResizeFrame).not.toBeNull()
  if (!narrowFirstResizeFrame) throw new Error('无法测量窄窗口缩放首帧')
  expect(narrowFirstResizeFrame.width).toBeGreaterThan(narrowResizeBox.width * 0.9)
  expect(narrowFirstResizeFrame.height).toBeGreaterThan(narrowResizeBox.height * 0.9)
  await page.mouse.move(narrowResizeStart.x - 24, narrowResizeStart.y - 8, { steps: 6 })
  await page.mouse.up()
  const narrowAfterResizeBox = await image.boundingBox()
  expect(narrowAfterResizeBox).not.toBeNull()
  if (!narrowAfterResizeBox) throw new Error('无法测量窄窗口缩放结果')
  expect(narrowResizeBox.width - narrowAfterResizeBox.width).toBeGreaterThan(12)
  expect(narrowResizeBox.width - narrowAfterResizeBox.width).toBeLessThan(36)
  expect(narrowAfterResizeBox.width / narrowAfterResizeBox.height).toBeCloseTo(
    narrowResizeBox.width / narrowResizeBox.height,
    2
  )
  await expect
    .poll(async () => (await readOnlyManifest(page)).revision)
    .toBe(narrowResizeDocument.revision + 1)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.locator('.canvas-scroll').evaluate((scrollArea) => {
    scrollArea.scrollTop = 0
  })
  await page.waitForTimeout(100)

  const beforeRotateDocument = await readOnlyManifest(page)
  const beforeRotateBlock = firstContentImageBlock(beforeRotateDocument)
  const rotationHandle = page.locator('.moveable-control.moveable-rotation-control')
  const rotationHandleBox = await rotationHandle.boundingBox()
  const selectedImageBox = await image.boundingBox()
  expect(rotationHandleBox).not.toBeNull()
  expect(selectedImageBox).not.toBeNull()
  if (!rotationHandleBox || !selectedImageBox) throw new Error('无法测量旋转柄')
  await page.mouse.move(
    rotationHandleBox.x + rotationHandleBox.width / 2,
    rotationHandleBox.y + rotationHandleBox.height / 2
  )
  await page.mouse.down()
  await expect(moveable).toBeVisible()
  await page.mouse.move(
    selectedImageBox.x + selectedImageBox.width + 32,
    selectedImageBox.y + selectedImageBox.height / 2,
    { steps: 12 }
  )
  await expect(moveable).toBeVisible()
  await page.mouse.up()
  await expect(moveable).toBeVisible()

  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const block = firstContentImageBlock(document)
      return {
        revisionChanged: document.revision > beforeRotateDocument.revision,
        rotationChanged: block.transform.rotationDeg !== beforeRotateBlock.transform.rotationDeg
      }
    })
    .toEqual({ revisionChanged: true, rotationChanged: true })

  await page
    .locator('.canvas-sheet > .album-document > .album-page')
    .click({ position: { x: 5, y: 5 } })
  await expect(moveable).toHaveCount(0)
  await expect(image).not.toHaveAttribute('data-selected', 'true')

  await image.click()
  await expect(moveable).toBeVisible()
  const before = await image.boundingBox()
  expect(before).not.toBeNull()
  if (!before) throw new Error('无法测量画布照片')
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 42, before.y + before.height / 2 + 28, {
    steps: 8
  })
  await page.mouse.up()

  await page.getByRole('button', { name: '裁剪与美化' }).click()
  await expect(page.getByRole('region', { name: '照片编辑' })).toBeVisible()
  await page.getByRole('button', { name: '暖阳', exact: true }).click()
  await page.getByRole('button', { name: '水平翻转', exact: true }).click()
  await page.getByRole('button', { name: '应用到照片' }).click()
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()

  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const content = document.pages.find(
        (candidate): candidate is ContentPage => candidate.kind === 'content'
      )
      const block = content?.blocks.find(
        (candidate): candidate is ImageBlock => candidate.type === 'image'
      )
      return block
        ? {
            x: block.transform.x,
            flipX: block.crop.flipX,
            sepia: block.effects.sepia
          }
        : null
    })
    .toMatchObject({ flipX: true, sepia: 0.14 })

  const saved = await readOnlyManifest(page)
  const savedImageBlock = firstContentImageBlock(saved)
  expect(savedImageBlock.transform.x).not.toBe(0.08)
  expect(JSON.stringify(saved)).not.toContain('RelativePath')

  await page.evaluate(() => {
    window.print = () => document.documentElement.setAttribute('data-print-called', 'true')
  })
  await page.getByRole('button', { name: '打印 / PDF' }).click()
  await expect.poll(() => page.locator('html').getAttribute('data-print-called')).toBe('true')
  await expect(page.getByText(`${LONG_PROJECT_TITLE}.pdf 已准备好`)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('browser-workspace-1440x900.png') })

  await page.reload()
  await expect(page.getByRole('button', { name: new RegExp(LONG_PROJECT_TITLE) })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(LONG_PROJECT_TITLE) }).click()
  await expect(page.getByText('第 1 页 · 4 个 Block', { exact: true })).toBeVisible()
  await page.getByText('第 1 页 · 4 个 Block', { exact: true }).click()
  await expect(
    page
      .getByRole('region', { name: '相册画布' })
      .getByRole('button', { name: '选择照片 浏览器测试照片.png' })
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: '相册画布' }).getByText('浏览器里的最后一段文字')
  ).toBeVisible()

  await page.setViewportSize({ width: 800, height: 640 })
  await expect(page.getByRole('button', { name: '装帧托盘' })).toBeVisible()
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll')
  await page.screenshot({ path: testInfo.outputPath('browser-workspace-800x640.png') })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(async (projectId) => {
    const root = await navigator.storage.getDirectory()
    const data = await root.getDirectoryHandle('album-studio')
    const projects = await data.getDirectoryHandle('projects')
    const project = await projects.getDirectoryHandle(projectId)
    await project.removeEntry('assets', { recursive: true })
    await project.removeEntry('cache', { recursive: true })
  }, saved.id)
  await page.reload()
  await page.getByRole('button', { name: new RegExp(LONG_PROJECT_TITLE) }).click()
  await expect(page.getByText('图片文件不可用').first()).toBeVisible()
  await page.getByRole('tab', { name: /素材/ }).click()
  await expect(page.getByText('图片数据不可用')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('browser-missing-asset-1440x900.png') })
})
