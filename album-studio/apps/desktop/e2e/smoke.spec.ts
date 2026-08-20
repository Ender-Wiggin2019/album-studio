import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import {
  AlbumDocumentSchema,
  createAlbumDocument,
  executeAlbumCommand,
  type AlbumCommand,
  type AlbumDocument,
  type AssetRecord,
  type ImageBlock
} from '@album-studio/common'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const desktopRoot = resolve(__dirname, '..')
const fixtureImagePath = join(desktopRoot, 'build', 'icon.png')
const NOW = '2026-08-15T12:00:00.000Z'
const PDF_POINTS_PER_MILLIMETER = 72 / 25.4

function deterministicIds(): () => string {
  let value = 0
  return () => `e2e-${++value}`
}

async function readManifest(path: string): Promise<AlbumDocument> {
  return AlbumDocumentSchema.parse(JSON.parse(await readFile(path, 'utf8')))
}

async function expectPdfMediaBox(path: string, widthMm: number, heightMm: number): Promise<void> {
  await expect
    .poll(async () => (await readFile(path)).subarray(0, 5).toString('ascii'))
    .toBe('%PDF-')
  const source = (await readFile(path)).toString('latin1')
  const coordinate = '(-?\\d+(?:\\.\\d+)?)'
  const match = new RegExp(
    `/MediaBox\\s*\\[\\s*${coordinate}\\s+${coordinate}\\s+${coordinate}\\s+${coordinate}\\s*\\]`
  ).exec(source)
  if (!match) throw new Error(`PDF 缺少 MediaBox：${path}`)
  const [, x1, y1, x2, y2] = match.map(Number)
  const widthPoints = x2 - x1
  const heightPoints = y2 - y1
  expect(Math.abs(widthPoints - widthMm * PDF_POINTS_PER_MILLIMETER)).toBeLessThanOrEqual(1)
  expect(Math.abs(heightPoints - heightMm * PDF_POINTS_PER_MILLIMETER)).toBeLessThanOrEqual(1)
}

function firstImageBlock(document: AlbumDocument, pageIndex: number): ImageBlock {
  const page = document.pages[pageIndex]
  const block = page?.blocks.find((candidate) => candidate.type === 'image')
  if (!block || block.type !== 'image') throw new Error(`第 ${pageIndex} 页缺少图片 Block`)
  return block
}

async function seedProject(userData: string): Promise<{
  document: AlbumDocument
  manifestPath: string
  projectRoot: string
}> {
  const projectRoot = join(userData, '端到端测试.album-project')
  const manifestPath = join(projectRoot, 'manifest.json')
  const originalDirectory = join(projectRoot, 'assets', 'original')
  await Promise.all([
    mkdir(originalDirectory, { recursive: true }),
    mkdir(join(projectRoot, 'assets', 'cache'), { recursive: true }),
    mkdir(join(projectRoot, 'backups'), { recursive: true })
  ])

  const image = await readFile(fixtureImagePath)
  const hash = createHash('sha256').update(image).digest('hex')
  const asset: AssetRecord = {
    id: `asset-${hash}`,
    fileName: '工作室测试照片.png',
    contentHash: hash,
    mimeType: 'image/png',
    byteSize: image.byteLength,
    width: 512,
    height: 512,
    importedAt: NOW
  }
  await writeFile(join(originalDirectory, `${hash}.png`), image)

  const ids = deterministicIds()
  let document = createAlbumDocument({ title: '端到端测试相册', themeId: 'journal', now: NOW }, ids)
  const apply = (command: AlbumCommand): void => {
    document = executeAlbumCommand(document, command, { idFactory: ids, now: NOW }).document
  }
  apply({ type: 'register-assets', assets: [asset] })
  apply({
    type: 'add-block',
    pageId: document.pages[0].id,
    block: { type: 'image', assetId: asset.id }
  })
  apply({ type: 'add-page', assetIds: [asset.id], layoutId: 'focus' })
  apply({
    type: 'add-page',
    assetIds: [asset.id, asset.id],
    layoutId: 'split-even'
  })
  apply({
    type: 'add-page',
    assetIds: [asset.id, asset.id, asset.id, asset.id],
    layoutId: 'grid-four'
  })
  apply({
    type: 'add-page',
    assetIds: [asset.id, asset.id, asset.id, asset.id, asset.id, asset.id],
    layoutId: 'contact-six'
  })

  await writeFile(manifestPath, `${JSON.stringify(document, null, 2)}\n`)
  await writeFile(
    join(userData, 'recent-projects.json'),
    `${JSON.stringify(
      [
        {
          id: document.id,
          title: document.title,
          path: projectRoot,
          updatedAt: document.updatedAt,
          themeId: document.themeId,
          missing: false
        }
      ],
      null,
      2
    )}\n`
  )
  return { document, manifestPath, projectRoot }
}

test.describe('咔宝', () => {
  let app: ElectronApplication
  let userData: string
  let seeded: Awaited<ReturnType<typeof seedProject>>

  test.beforeEach(async () => {
    userData = await mkdtemp(join(tmpdir(), 'album-studio-e2e-'))
    seeded = await seedProject(userData)
    app = await electron.launch({
      args: [desktopRoot],
      cwd: desktopRoot,
      env: { ...process.env, ALBUM_STUDIO_USER_DATA_DIR: userData }
    })
  })

  test.afterEach(async () => {
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined)
    await app.close().catch(() => undefined)
    await rm(userData, { recursive: true, force: true })
  })

  test('新格式项目支持自由拖拽、图片编辑、自动保存与 PDF 导出', async ({
    browserName
  }, testInfo) => {
    expect(browserName).toBe('chromium')
    const page = await app.firstWindow()
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.stack ?? error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle('咔宝')
    // 启动后自动继续打开最近编辑过的相册，不再停留在项目首页
    await expect(page.locator('.project-identity')).toContainText('端到端测试相册')
    await expect(page.getByText('已保存', { exact: true })).toBeVisible()

    const sandbox = await page.evaluate(() => ({
      requireType: typeof (globalThis as { require?: unknown }).require,
      processType: typeof (globalThis as { process?: unknown }).process,
      hasAlbumApi: typeof window.albumStudio === 'object'
    }))
    expect(sandbox).toEqual({
      requireType: 'undefined',
      processType: 'undefined',
      hasAlbumApi: true
    })
    await page.screenshot({ path: testInfo.outputPath('workspace-1440x900.png') })

    await expect(page.getByRole('button', { name: '导出 PDF' })).toBeVisible()
    await page
      .getByRole('complementary', { name: '相册页面' })
      .getByRole('button', { name: '第 1 页 · 1 个 Block', exact: true })
      .click()

    const firstContentPage = seeded.document.pages[1]
    expect(firstContentPage.kind).toBe('content')
    if (firstContentPage.kind !== 'content') throw new Error('测试种子缺少内容页')
    const firstElement = firstImageBlock(seeded.document, 1)
    const imageElement = page
      .getByRole('region', { name: '相册画布' })
      .locator(`[data-block-id="${firstElement.id}"]`)
    await expect(imageElement).toBeVisible()
    await imageElement.click()
    await expect(page.locator('.moveable-control-box')).toBeVisible()
    const beforeDrag = await imageElement.boundingBox()
    if (!beforeDrag) throw new Error('无法获取待拖拽照片的位置')
    await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      beforeDrag.x + beforeDrag.width / 2 + 36,
      beforeDrag.y + beforeDrag.height / 2 + 24,
      { steps: 8 }
    )
    await page.mouse.up()

    await expect
      .poll(async () => {
        const saved = await readManifest(seeded.manifestPath)
        const contentPage = saved.pages[1]
        if (contentPage.kind !== 'content') return null
        const transform = firstImageBlock(saved, 1).transform
        return transform.x > firstElement.transform.x && transform.y > firstElement.transform.y
          ? saved.revision
          : null
      })
      .toBeGreaterThan(seeded.document.revision)
    const afterDrag = await readManifest(seeded.manifestPath)
    const draggedPage = afterDrag.pages[1]
    expect(draggedPage.kind).toBe('content')
    if (draggedPage.kind !== 'content') throw new Error('拖拽后内容页类型错误')
    expect(firstImageBlock(afterDrag, 1).transform.x).toBeGreaterThan(firstElement.transform.x)
    expect(firstImageBlock(afterDrag, 1).transform.y).toBeGreaterThan(firstElement.transform.y)
    expect(afterDrag.revision).toBeGreaterThan(seeded.document.revision)

    await imageElement.click()
    await page
      .getByRole('complementary', { name: '装帧托盘' })
      .getByRole('button', { name: '裁剪与美化' })
      .click()
    const photoEditor = page.getByRole('region', { name: '照片编辑' })
    await expect
      .poll(async () => {
        if (runtimeErrors.length) {
          throw new Error(`照片编辑器运行时错误：\n${runtimeErrors.join('\n')}`)
        }
        return photoEditor.isVisible()
      })
      .toBe(true)
    const cropperImage = photoEditor.locator('.album-edit-source-image')
    await expect(cropperImage).toBeVisible()
    await expect
      .poll(() => cropperImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    const sliders = photoEditor.getByRole('slider')
    await expect(sliders).toHaveCount(12)
    // 自由裁剪：把东南角手柄向内拖，生成 <100% 的裁剪区域
    const cropSelection = photoEditor.locator('.ReactCrop__crop-selection')
    await expect(cropSelection).toBeVisible()
    const seHandle = cropSelection.locator('[data-ord="se"]')
    const handleBox = await seHandle.boundingBox()
    const selectionBox = await cropSelection.boundingBox()
    if (!handleBox || !selectionBox) throw new Error('无法测量自由裁剪框')
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(
      selectionBox.x + selectionBox.width * 0.45,
      selectionBox.y + selectionBox.height * 0.45,
      { steps: 8 }
    )
    await page.mouse.up()
    await sliders.nth(0).focus()
    for (let index = 0; index < 12; index += 1) await page.keyboard.press('ArrowRight')
    await photoEditor.getByRole('button', { name: '暖阳' }).click()
    // 自动美化：只修正亮度/对比度/饱和度，保留暖阳的复古与暗角；分析期间按钮禁用
    await expect(photoEditor.getByRole('button', { name: '自动美化' })).toBeEnabled()
    await photoEditor.getByRole('button', { name: '自动美化' }).click()
    await expect(photoEditor.getByRole('button', { name: '自动美化' })).toBeEnabled()
    await sliders.nth(9).focus()
    for (let index = 0; index < 30; index += 1) await page.keyboard.press('ArrowRight')
    await sliders.nth(10).focus()
    for (let index = 0; index < 20; index += 1) await page.keyboard.press('ArrowRight')
    await sliders.nth(11).focus()
    for (let index = 0; index < 15; index += 1) await page.keyboard.press('ArrowRight')
    await photoEditor.getByRole('button', { name: '水平翻转' }).click()
    await page.screenshot({ path: testInfo.outputPath('photo-editor-1440x900.png') })
    await photoEditor.getByRole('button', { name: '应用到照片' }).click()

    await expect
      .poll(async () => {
        const saved = await readManifest(seeded.manifestPath)
        const contentPage = saved.pages[1]
        const element = contentPage.kind === 'content' ? firstImageBlock(saved, 1) : null
        return element
          ? {
              flipX: element.crop.flipX,
              rotationDeg: element.crop.rotationDeg,
              cropWidth: element.crop.area.width,
              sepia: element.effects.sepia,
              vignette: element.effects.vignette,
              beautySmooth: element.effects.beautySmooth,
              beautyWhiten: element.effects.beautyWhiten,
              clarity: element.effects.clarity
            }
          : null
      })
      .toMatchObject({
        flipX: true,
        rotationDeg: 12,
        sepia: 0.14,
        vignette: 0.08,
        beautySmooth: 0.3,
        beautyWhiten: 0.2,
        clarity: 0.15
      })
    const edited = await readManifest(seeded.manifestPath)
    const editedPage = edited.pages[1]
    expect(editedPage.kind).toBe('content')
    if (editedPage.kind !== 'content') throw new Error('图片编辑后内容页类型错误')
    // 自动美化只修正亮度/对比度/饱和度：三个参数不再等于暖阳预设值，且复古/暗角保留
    const autoEffects = firstImageBlock(edited, 1).effects
    expect([autoEffects.brightness, autoEffects.contrast, autoEffects.saturation]).not.toEqual([
      1.06,
      1.03,
      1.08
    ])
    expect(autoEffects.sepia).toBe(0.14)
    expect(autoEffects.vignette).toBe(0.08)
    expect(
      Math.min(
        firstImageBlock(edited, 1).crop.area.width,
        firstImageBlock(edited, 1).crop.area.height
      )
    ).toBeLessThan(100)
    await expect(page.getByText('已保存', { exact: true })).toBeVisible()

    const exportedPdf = testInfo.outputPath('端到端测试相册.pdf')
    await app.evaluate(({ dialog }, outputPath) => {
      Object.defineProperty(dialog, 'showSaveDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePath: outputPath })
      })
    }, exportedPdf)
    await page.getByRole('button', { name: '导出 PDF' }).click()
    await expect(page.getByText('端到端测试相册.pdf 已准备好', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expectPdfMediaBox(exportedPdf, 297, 210)
    await page.getByRole('button', { name: '关闭' }).click()

    const browserWindow = await app.browserWindow(page)
    await browserWindow.evaluate((window) => window.setSize(1100, 720))
    const rightPanelTrigger = page.getByRole('button', { name: '装帧托盘' })
    await expect(rightPanelTrigger).toBeVisible()
    await rightPanelTrigger.click()
    const rightPanelDialog = page.getByRole('dialog', { name: '装帧托盘' })
    await expect(rightPanelDialog).toBeVisible()
    await rightPanelDialog.getByRole('button', { name: '关闭' }).click()
    await expect(rightPanelTrigger).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('workspace-1100x720.png') })
    await browserWindow.evaluate((window) => window.setSize(800, 640))
    await expect(page.getByRole('complementary', { name: '相册页面' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('workspace-800x640.png') })
  })

  test('新建、导入、自动分页、保存并重新打开严格新格式', async ({ browserName }, testInfo) => {
    test.setTimeout(90_000)
    expect(browserName).toBe('chromium')
    const projectParent = join(userData, '新建项目')
    const photoSource = join(userData, '待导入照片')
    await mkdir(projectParent)
    await mkdir(photoSource)
    await copyFile(fixtureImagePath, join(photoSource, '新照片.png'))
    await app.evaluate(
      ({ dialog }, routes) => {
        Object.defineProperty(dialog, 'showOpenDialog', {
          configurable: true,
          value: async (...args: unknown[]) => {
            const options = args.at(-1) as { title?: string }
            const selected =
              options.title === '选择相册项目保存位置' ? routes.parent : routes.photos
            return { canceled: false, filePaths: [selected] }
          }
        })
      },
      { parent: projectParent, photos: photoSource }
    )

    const page = await app.firstWindow()
    // 自动继续打开种子相册后，先返回首页再走新建流程
    await expect(page.getByRole('button', { name: '返回项目首页' })).toBeVisible()
    await page.getByRole('button', { name: '返回项目首页' }).click()
    await expect(page.getByRole('button', { name: '新建相册' }).first()).toBeVisible()
    await page.getByRole('button', { name: '新建相册' }).first().click()
    await page.getByLabel('相册名称').fill('新建流程相册')
    await page.getByRole('radio', { name: /12 寸方形/ }).click()
    await page.getByRole('radio', { name: /海风明信片/ }).click()
    await page.getByRole('button', { name: '创建相册' }).click()
    await expect(page.locator('.project-identity')).toContainText('新建流程相册')

    await page.getByRole('tab', { name: /素材/ }).click()
    await page.getByRole('button', { name: '选择照片文件夹' }).first().click()
    await expect(page.getByRole('heading', { name: '选择要导入的照片' })).toBeVisible({
      timeout: 30_000
    })
    await page.getByRole('checkbox', { name: '选择 新照片.png' }).click()
    await page.getByRole('button', { name: /导入所选/ }).click()
    await expect(page.getByRole('button', { name: /添加 新照片\.png 到当前页/ })).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '批量添加' }).click()
    await page.getByRole('button', { name: /自动创建新页/ }).click()
    await expect(page.getByText('第 1 页 · 1 个 Block', { exact: true })).toBeVisible()
    await expect(page.getByText('正在保存…', { exact: true })).toBeVisible()
    await expect(page.getByText('已保存', { exact: true })).toBeVisible({ timeout: 30_000 })

    const manifestPath = join(projectParent, '新建流程相册.album-project', 'manifest.json')
    await expect.poll(async () => (await readManifest(manifestPath)).pages.length).toBe(2)
    const created = await readManifest(manifestPath)
    expect(created.schemaVersion).toBe(2)
    expect(created.themeId).toBe('postcard')
    expect(created.pageSpec).toEqual({
      presetId: 'square-12',
      widthMm: 304.8,
      heightMm: 304.8
    })
    expect(created.assets).toHaveLength(1)
    expect(created.pages).toHaveLength(2)
    expect(created.pages[1]).toMatchObject({ kind: 'content', layoutId: null })
    expect(JSON.stringify(created)).not.toContain('originalRelativePath')
    expect(JSON.stringify(created)).not.toContain('slots')
    expect(
      (
        await readFile(
          join(
            projectParent,
            '新建流程相册.album-project',
            'assets',
            'original',
            `${created.assets[0].contentHash}.png`
          )
        )
      ).byteLength
    ).toBeGreaterThan(0)

    await page.getByRole('button', { name: '返回项目首页' }).click()
    await page.getByRole('button', { name: /新建流程相册/ }).click()
    await expect(page.getByText('第 1 页 · 1 个 Block', { exact: true })).toBeVisible()
    const reopened = await readManifest(manifestPath)
    expect(reopened.assets).toHaveLength(1)
    expect(reopened.pages[1]).toMatchObject({ kind: 'content', layoutId: null })

    const squarePdf = testInfo.outputPath('方形相册.pdf')
    await app.evaluate(({ dialog }, outputPath) => {
      Object.defineProperty(dialog, 'showSaveDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePath: outputPath })
      })
    }, squarePdf)
    await page.getByRole('button', { name: '导出 PDF' }).click()
    await expect(page.getByText('新建流程相册.pdf 已准备好', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expectPdfMediaBox(squarePdf, 304.8, 304.8)
    await page.getByRole('button', { name: '关闭' }).click()

    await page.getByRole('button', { name: '返回项目首页' }).click()
    await page.getByRole('button', { name: '新建相册' }).first().click()
    await page.getByLabel('相册名称').fill('宽屏流程相册')
    await page.getByRole('radio', { name: /16:9 宽屏/ }).click()
    await page.getByRole('button', { name: '创建相册' }).click()
    await expect(page.locator('.project-identity')).toContainText('宽屏流程相册')
    const widescreenManifestPath = join(
      projectParent,
      '宽屏流程相册.album-project',
      'manifest.json'
    )
    await expect
      .poll(async () => (await readManifest(widescreenManifestPath)).pageSpec.presetId)
      .toBe('widescreen-16-9')

    const widescreenPdf = testInfo.outputPath('宽屏相册.pdf')
    await app.evaluate(({ dialog }, outputPath) => {
      Object.defineProperty(dialog, 'showSaveDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePath: outputPath })
      })
    }, widescreenPdf)
    await page.getByRole('button', { name: '导出 PDF' }).click()
    await expect(page.getByText('宽屏流程相册.pdf 已准备好', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expectPdfMediaBox(widescreenPdf, 338.67, 190.5)

    await page.getByRole('button', { name: '关闭' }).click()
    await page.getByRole('button', { name: '返回项目首页' }).click()
    await page.getByRole('button', { name: '新建相册' }).first().click()
    await page.getByLabel('相册名称').fill('竖排流程相册')
    await page.getByRole('radio', { name: /A4 竖排/ }).click()
    await page.getByRole('button', { name: '创建相册' }).click()
    await expect(page.locator('.project-identity')).toContainText('竖排流程相册')
    const portraitManifestPath = join(projectParent, '竖排流程相册.album-project', 'manifest.json')
    await expect
      .poll(async () => (await readManifest(portraitManifestPath)).pageSpec.presetId)
      .toBe('a4-portrait')

    const portraitPdf = testInfo.outputPath('竖排相册.pdf')
    await app.evaluate(({ dialog }, outputPath) => {
      Object.defineProperty(dialog, 'showSaveDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePath: outputPath })
      })
    }, portraitPdf)
    await page.getByRole('button', { name: '导出 PDF' }).click()
    await expect(page.getByText('竖排流程相册.pdf 已准备好', { exact: true })).toBeVisible({
      timeout: 30_000
    })
    await expectPdfMediaBox(portraitPdf, 210, 297)
  })

  test('关闭窗口前提交仍在聚焦的照片说明与富文本', async () => {
    const page = await app.firstWindow()
    await expect(page.getByText('已保存', { exact: true })).toBeVisible()
    await page
      .getByRole('complementary', { name: '相册页面' })
      .getByRole('button', { name: '第 1 页 · 1 个 Block', exact: true })
      .click()
    await page
      .getByRole('region', { name: '相册画布' })
      .getByRole('button', { name: '选择照片 工作室测试照片.png' })
      .click()
    const captionInput = page.getByRole('complementary', { name: '装帧托盘' }).locator('textarea')
    await captionInput.fill('关闭前最后输入')
    await page.getByRole('tab', { name: /组件/ }).click()
    await page.getByRole('button', { name: '添加文字' }).click()
    await page
      .getByRole('region', { name: '相册画布' })
      .getByRole('button', { name: '选择文字' })
      .click()
    const textEditor = page.getByRole('textbox', { name: '富文本内容' })
    await textEditor.fill('关闭前最后富文本')
    await expect(textEditor).toBeFocused()

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
    await expect
      .poll(async () => {
        const saved = await readManifest(seeded.manifestPath)
        const contentPage = saved.pages[1]
        const richText = contentPage.blocks.find((block) => block.type === 'rich-text')
        return contentPage.kind === 'content'
          ? {
              caption: firstImageBlock(saved, 1).caption.text,
              richText: richText?.type === 'rich-text' ? JSON.stringify(richText.document) : ''
            }
          : null
      })
      .toMatchObject({
        caption: '关闭前最后输入',
        richText: expect.stringContaining('关闭前最后富文本')
      })
  })

  test('消除人物：自动识别、应用修补、确认后写入文档并渲染修补图', async ({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium')
    const page = await app.firstWindow()
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.stack ?? error.message))
    await page.waitForLoadState('networkidle')
    // 启动后自动继续打开种子相册
    await expect(page.getByText('已保存', { exact: true })).toBeVisible()

    await page
      .getByRole('complementary', { name: '相册页面' })
      .getByRole('button', { name: '第 1 页 · 1 个 Block', exact: true })
      .click()
    const firstElement = firstImageBlock(seeded.document, 1)
    const imageElement = page
      .getByRole('region', { name: '相册画布' })
      .locator(`[data-block-id="${firstElement.id}"]`)
    await expect(imageElement).toBeVisible()
    await imageElement.click()
    await expect(page.locator('.moveable-control-box')).toBeVisible()

    await page
      .getByRole('complementary', { name: '装帧托盘' })
      .getByRole('button', { name: '消除人物' })
      .click()
    const eraseWorkspace = page.getByRole('region', { name: '消除人物' })
    await expect(eraseWorkspace).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('erase-edit-1440x900.png') })

    await eraseWorkspace.getByRole('button', { name: '自动识别人物' }).click()
    await expect(eraseWorkspace.getByRole('button', { name: /已识别/ })).toBeVisible({
      timeout: 30_000
    })

    await eraseWorkspace.getByRole('button', { name: '应用消除' }).click()
    await expect(eraseWorkspace.getByRole('button', { name: '确认应用' })).toBeVisible({
      timeout: 60_000
    })
    await page.screenshot({ path: testInfo.outputPath('erase-preview-1440x900.png') })
    await eraseWorkspace.getByRole('button', { name: '确认应用' }).click()

    await expect
      .poll(async () => {
        if (runtimeErrors.length) {
          throw new Error(`消除流程运行时错误：\n${runtimeErrors.join('\n')}`)
        }
        const saved = await readManifest(seeded.manifestPath)
        const block = firstImageBlock(saved, 1)
        return block.erase
      })
      .toMatchObject({ autoDetect: true })
    const saved = await readManifest(seeded.manifestPath)
    expect(saved.pages[1].blocks).toContainEqual(
      expect.objectContaining({ id: firstElement.id, erase: expect.any(Object) })
    )

    // 画布渲染修补图（quality=erased 请求成功，未回退原图）
    await expect(imageElement).toBeVisible()
    const imageSource = imageElement.locator('img')
    await expect
      .poll(async () => imageSource.getAttribute('src'))
      .toContain('quality=erased')
    await expect.poll(async () => imageSource.getAttribute('src')).toContain('erase=')
    await expect(page.getByText('图片文件不可用')).toHaveCount(0)
  })
})
