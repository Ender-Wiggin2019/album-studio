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
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await root.removeEntry('album-studio', { recursive: true })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'NotFoundError') return
        if (!(error instanceof DOMException && error.name === 'InvalidModificationError')) {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
    }
    throw new Error('浏览器项目目录仍被上一个文件操作占用')
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
  await page.route('**/__e2e_storage__', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>E2E storage</title>' })
  )
  await page.goto('/__e2e_storage__')
  await clearBrowserProjects(page)
  await page.unroute('**/__e2e_storage__')
  await page.goto('/')
})

test('页面栏支持拖拽排序、取消、撤销重做与刷新持久化', async ({ page }) => {
  await page.getByRole('button', { name: '新建相册' }).first().click()
  await page.getByLabel('相册名称').fill('页面排序回归')
  await page.getByRole('button', { name: '创建相册' }).click()
  await expect(page.locator('.project-identity')).toContainText('页面排序回归')

  await page.getByRole('button', { name: '添加页面' }).click()
  await page.getByRole('button', { name: '添加页面' }).click()
  await expect.poll(async () => (await readOnlyManifest(page)).pages.length).toBe(3)
  await expect(page.locator('.page-rail')).toHaveCSS('flex-direction', 'column')
  const originalIds = (await readOnlyManifest(page)).pages.map((albumPage) => albumPage.id)
  const reorderedIds = [originalIds[0], originalIds[2], originalIds[1]]

  const firstHandle = page.getByRole('button', { name: '拖拽排序第 1 页' })
  const secondHandle = page.getByRole('button', { name: '拖拽排序第 2 页' })
  const firstHandleBox = await firstHandle.boundingBox()
  const secondItemBox = await page
    .locator('.page-rail-item')
    .filter({ has: secondHandle })
    .boundingBox()
  if (!firstHandleBox || !secondItemBox) throw new Error('无法测量页面排序手柄')

  await page.mouse.move(
    firstHandleBox.x + firstHandleBox.width / 2,
    firstHandleBox.y + firstHandleBox.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    firstHandleBox.x + firstHandleBox.width / 2 + 8,
    firstHandleBox.y + firstHandleBox.height / 2 + 8,
    { steps: 4 }
  )
  await expect(page.locator('.page-rail-item[data-dnd-dragging="true"]')).toHaveAttribute(
    'data-page-id',
    originalIds[1]
  )
  await page.mouse.move(
    secondItemBox.x + secondItemBox.width / 2,
    secondItemBox.y + secondItemBox.height * 0.9,
    { steps: 12 }
  )
  // dnd-kit 先做 optimistic DOM 排序；等可见顺序真正改变再松手，
  // 避免测试机器在最后一次 pointermove 尚未处理时就发出 pointerup。
  await expect
    .poll(async () =>
      page
        .locator('.page-rail-list > .page-rail-item:not([data-dnd-placeholder])')
        .evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.pageId))
    )
    .toEqual(reorderedIds)
  await page.mouse.up()

  await expect
    .poll(async () => (await readOnlyManifest(page)).pages.map(({ id }) => id))
    .toEqual(reorderedIds)

  await page.getByRole('button', { name: '撤销' }).click()
  await expect
    .poll(async () => (await readOnlyManifest(page)).pages.map(({ id }) => id))
    .toEqual(originalIds)
  await page.getByRole('button', { name: '重做' }).click()
  await expect
    .poll(async () => (await readOnlyManifest(page)).pages.map(({ id }) => id))
    .toEqual(reorderedIds)

  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.project-identity')).toContainText('页面排序回归')
  await expect
    .poll(async () => (await readOnlyManifest(page)).pages.map(({ id }) => id))
    .toEqual(reorderedIds)

  await page.setViewportSize({ width: 800, height: 640 })
  await expect(page.locator('.page-rail')).toHaveCSS('flex-direction', 'row')
  await expect(page.locator('.canvas-sheet')).toHaveCSS('transition-duration', '0s')
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sheet = document.querySelector('.canvas-sheet')?.getBoundingClientRect()
        const rail = document.querySelector('.page-rail')?.getBoundingClientRect()
        return sheet && rail ? sheet.bottom <= rail.top + 1 : false
      })
    })
    .toBe(true)
  const narrowHandle = page.getByRole('button', { name: '拖拽排序第 1 页' })
  await expect(narrowHandle).toBeVisible()
  await expect(narrowHandle).toBeEnabled()
  const narrowHandleBox = await narrowHandle.boundingBox()
  expect(narrowHandleBox).not.toBeNull()
  expect(narrowHandleBox!.x).toBeGreaterThanOrEqual(0)
  expect(narrowHandleBox!.x + narrowHandleBox!.width).toBeLessThanOrEqual(800)

  await narrowHandle.focus()
  await narrowHandle.press('Space')
  const narrowItem = page.locator('.page-rail-item').filter({ has: narrowHandle })
  await expect(narrowItem).toHaveAttribute('data-dragging', 'true')
  await narrowHandle.press('ArrowRight')
  await narrowHandle.press('Escape')
  await expect(narrowItem).not.toHaveAttribute('data-dragging', 'true')
  await expect
    .poll(async () => (await readOnlyManifest(page)).pages.map(({ id }) => id))
    .toEqual(reorderedIds)
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
  await expect(page.getByRole('heading', { name: '选择要导入的照片' })).toBeVisible()
  await page.getByRole('checkbox', { name: '选择 无法解码的超长中文照片文件名.png' }).click()
  await page.getByRole('button', { name: /导入所选/ }).click()
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
  await expect(page.getByRole('heading', { name: '选择要导入的照片' })).toBeVisible()
  await page.getByRole('checkbox', { name: '选择 浏览器测试照片.png' }).click()
  await page.getByRole('button', { name: /导入所选/ }).click()
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
  await expect(responsivePanel).toBeVisible()
  await responsivePanel.getByRole('button', { name: '关闭' }).click()
  await expect(responsivePanel).not.toBeVisible()
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
  await page.mouse.move(narrowResizeStart.x - 36, narrowResizeStart.y - 12, { steps: 6 })
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

  // 网页版不声明 erase-people 能力：消除人物入口隐藏（当前图片已选中）
  await expect(page.getByRole('button', { name: '消除人物' })).toHaveCount(0)
  await page.getByRole('button', { name: '裁剪与美化' }).click()
  await expect(page.getByRole('region', { name: '照片编辑' })).toBeVisible()
  await page.getByRole('button', { name: '暖阳', exact: true }).click()
  // 自动美化：只修正亮度/对比度/饱和度，保留暖阳的复古与暗角
  await expect(page.getByRole('button', { name: '自动美化' })).toBeEnabled()
  await page.getByRole('button', { name: '自动美化' }).click()
  // 单色测试图分位跨度 0 → 对比度补足到 1.3（暖阳预设对比度为 1.03，被自动修正覆盖）
  await expect(page.getByText('1.30×', { exact: true }).first()).toBeVisible()
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
            sepia: block.effects.sepia,
            contrast: block.effects.contrast
          }
        : null
    })
    .toMatchObject({ flipX: true, sepia: 0.14, contrast: 1.3 })

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
  // 刷新后自动继续打开最近编辑的相册，直接回到工作区
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
  // 刷新后自动继续打开该相册，缺失素材直接呈现
  await expect(page.getByText('图片文件不可用').first()).toBeVisible()
  await page.getByRole('tab', { name: /素材/ }).click()
  await expect(page.getByText('图片数据不可用')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('browser-missing-asset-1440x900.png') })
})
