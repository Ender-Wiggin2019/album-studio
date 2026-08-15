import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createContentPage, createEmptyProject, type AlbumProject } from '@album-studio/common'

const desktopRoot = resolve(__dirname, '..')
const TEST_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

function testIds(): () => string {
  let value = 0
  return () => `e2e-${++value}`
}

async function seedProject(root: string): Promise<AlbumProject> {
  const projectRoot = join(root, '端到端测试.album-project')
  const originalDirectory = join(projectRoot, 'assets', 'original')
  await mkdir(originalDirectory, { recursive: true })
  const png = TEST_PNG
  const hash = createHash('sha256').update(png).digest('hex')
  const assetId = `asset-${hash.slice(0, 24)}`
  await writeFile(join(originalDirectory, `${hash}.png`), png)
  const project = createEmptyProject(
    { title: '端到端测试相册', themeId: 'journal', now: '2026-08-15T12:00:00.000Z' },
    testIds()
  )
  project.assets.push({
    id: assetId,
    fileName: '一像素测试照片.png',
    contentHash: hash,
    mimeType: 'image/png',
    byteSize: png.byteLength,
    width: 1,
    height: 1,
    originalRelativePath: `assets/original/${hash}.png`,
    importedAt: '2026-08-15T12:00:00.000Z'
  })
  project.pages[0].kind === 'cover' && (project.pages[0].heroAssetId = assetId)
  project.pages.push(
    createContentPage([assetId], testIds()),
    createContentPage([assetId, assetId], testIds()),
    createContentPage([assetId, assetId, assetId, assetId], testIds()),
    createContentPage([assetId, assetId, assetId, assetId, assetId, assetId], testIds())
  )
  await writeFile(join(projectRoot, 'manifest.json'), `${JSON.stringify(project, null, 2)}\n`)
  await writeFile(
    join(root, 'recent-projects.json'),
    `${JSON.stringify([
      {
        id: project.id,
        title: project.title,
        path: projectRoot,
        updatedAt: project.updatedAt,
        themeId: project.themeId,
        missing: false
      }
    ])}\n`
  )
  return project
}

test.describe('电子相册工作室', () => {
  let app: ElectronApplication
  let userData: string

  test.beforeEach(async () => {
    userData = await mkdtemp(join(tmpdir(), 'album-studio-e2e-'))
    await seedProject(userData)
    app = await electron.launch({
      args: [desktopRoot],
      cwd: desktopRoot,
      env: { ...process.env, ALBUM_STUDIO_USER_DATA_DIR: userData }
    })
  })

  test.afterEach(async () => {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await app.close().catch(() => undefined)
    await rm(userData, { recursive: true, force: true })
  })

  test('项目首页、工作区、自动保存和响应式布局可用', async ({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium')
    const page = await app.firstWindow()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveTitle('电子相册工作室')
    await expect(
      page.getByRole('heading', { name: '把散落的照片，整理成一本真正的相册。' })
    ).toBeVisible()
    await expect(page.getByRole('button', { name: /端到端测试相册/ })).toBeVisible()

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
    await page.screenshot({ path: testInfo.outputPath('home-1440x900.png') })

    await page.getByRole('button', { name: /端到端测试相册/ }).click()
    await expect(page.getByText('已保存', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '导出 PDF' })).toBeVisible()
    await expect(page.locator('.canvas-sheet')).toBeVisible()

    await page.getByText('第 1 页 · 1 张', { exact: true }).click()
    await page.locator('.inspector').getByRole('radio', { name: '2', exact: true }).click()
    await expect
      .poll(async () => {
        const saved = JSON.parse(
          await readFile(join(userData, '端到端测试.album-project', 'manifest.json'), 'utf8')
        ) as AlbumProject
        return saved.revision
      })
      .toBeGreaterThan(0)
    const manifest = JSON.parse(
      await readFile(join(userData, '端到端测试.album-project', 'manifest.json'), 'utf8')
    ) as AlbumProject
    expect(manifest.revision).toBeGreaterThan(0)
    expect(manifest.pages[1].kind === 'content' && manifest.pages[1].slots).toHaveLength(2)

    await page
      .getByRole('region', { name: '相册画布' })
      .getByRole('button', { name: '编辑照片 一像素测试照片.png' })
      .click()
    await page.getByRole('button', { name: '裁剪与旋转' }).click()
    await expect(page.getByRole('region', { name: '照片编辑' })).toBeVisible()
    await page.getByRole('button', { name: '水平翻转' }).click()
    await page.screenshot({ path: testInfo.outputPath('photo-editor-1440x900.png') })
    await page.getByRole('button', { name: '应用到照片' }).click()
    await expect
      .poll(async () => {
        const saved = JSON.parse(
          await readFile(join(userData, '端到端测试.album-project', 'manifest.json'), 'utf8')
        ) as AlbumProject
        return saved.revision
      })
      .toBeGreaterThan(manifest.revision)
    const editedManifest = JSON.parse(
      await readFile(join(userData, '端到端测试.album-project', 'manifest.json'), 'utf8')
    ) as AlbumProject
    expect(
      editedManifest.pages[1].kind === 'content' && editedManifest.pages[1].slots[0].media.flipX
    ).toBe(true)

    const exportedPdf = testInfo.outputPath('端到端测试相册.pdf')
    await app.evaluate(({ dialog }, outputPath) => {
      Object.defineProperty(dialog, 'showSaveDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePath: outputPath })
      })
    }, exportedPdf)
    await page.getByRole('button', { name: '导出 PDF' }).click()
    await expect(page.getByText('PDF 已导出', { exact: true })).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(async () => (await readFile(exportedPdf)).subarray(0, 5).toString('ascii'))
      .toBe('%PDF-')
    await page.keyboard.press('Escape')
    await expect(page.getByText('PDF 已导出', { exact: true })).not.toBeVisible()

    const browserWindow = await app.browserWindow(page)
    await browserWindow.evaluate((window) => window.setSize(1100, 720))
    await expect(page.getByRole('button', { name: '属性' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('workspace-1100x720.png') })

    await browserWindow.evaluate((window) => window.setSize(800, 640))
    await expect(page.locator('.page-rail')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('workspace-800x640.png') })
  })

  test('新建、导入素材、自动分页、保存并重开', async () => {
    const projectParent = join(userData, '新建项目')
    const photoSource = join(userData, '待导入照片')
    await mkdir(projectParent)
    await mkdir(photoSource)
    await writeFile(join(photoSource, '新照片.png'), TEST_PNG)
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
    await page.getByRole('button', { name: '新建相册' }).first().click()
    await page.getByLabel('相册名称').fill('新建流程相册')
    await page.getByRole('radio', { name: /海风明信片/ }).click()
    await page.getByRole('button', { name: '创建相册' }).click()
    await expect(page.locator('.project-identity')).toContainText('新建流程相册')

    await page.getByRole('button', { name: '素材库' }).click()
    await page.getByRole('button', { name: '选择照片文件夹' }).first().click()
    await expect(page.getByRole('button', { name: /新照片.png/ })).toBeVisible()
    await page.getByRole('button', { name: '添加到相册' }).click()
    await page.getByRole('button', { name: /自动分页/ }).click()
    await expect(page.getByText('第 1 页 · 1 张', { exact: true })).toBeVisible()

    const manifestPath = join(projectParent, '新建流程相册.album-project', 'manifest.json')
    await expect
      .poll(async () => (JSON.parse(await readFile(manifestPath, 'utf8')) as AlbumProject).revision)
      .toBeGreaterThan(0)
    await page.getByRole('button', { name: '返回项目首页' }).click()
    await page.getByRole('button', { name: /新建流程相册/ }).click()
    await expect(page.getByText('第 1 页 · 1 张', { exact: true })).toBeVisible()
    const reopened = JSON.parse(await readFile(manifestPath, 'utf8')) as AlbumProject
    expect(reopened.assets).toHaveLength(1)
    expect(reopened.themeId).toBe('postcard')
  })

  test('迁移旧 JSON 与内嵌 HTML，保留源文件并去重素材', async () => {
    const dataUrl = `data:image/png;base64,${TEST_PNG.toString('base64')}`
    const legacy = {
      schemaVersion: 2,
      updatedAt: '2026-06-29T00:00:00.000Z',
      title: 'JSON 旧版夹具',
      pageSize: 2,
      items: [
        { id: 'one', fileName: 'one.png', dataUrl, edit: { zoom: 115 } },
        { id: 'two', fileName: 'duplicate.png', dataUrl, edit: {} },
        { id: 'blank', fileName: '', dataUrl: '', edit: {} }
      ]
    }
    const jsonPath = join(userData, 'legacy-v2.json')
    const htmlPath = join(userData, 'legacy-v2.html')
    await writeFile(jsonPath, JSON.stringify(legacy))
    await writeFile(
      htmlPath,
      `<!doctype html><body data-theme="film"><script>window.mustNotRun=true</script><script id="embeddedAlbumData" type="application/json">${JSON.stringify({ ...legacy, title: 'HTML 旧版夹具' })}</script></body>`
    )
    const hashesBefore = await Promise.all(
      [jsonPath, htmlPath].map(async (path) =>
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex')
      )
    )
    await app.evaluate(
      ({ dialog }, routes) => {
        const sources = [...routes.sources]
        Object.defineProperty(dialog, 'showOpenDialog', {
          configurable: true,
          value: async (...args: unknown[]) => {
            const options = args.at(-1) as { title?: string }
            const selected = options.title === '导入旧相册' ? sources.shift() : routes.destination
            return selected
              ? { canceled: false, filePaths: [selected] }
              : { canceled: true, filePaths: [] }
          }
        })
      },
      { sources: [jsonPath, htmlPath], destination: userData }
    )

    const page = await app.firstWindow()
    for (const title of ['JSON 旧版夹具', 'HTML 旧版夹具']) {
      await page.getByRole('button', { name: '导入旧相册' }).click()
      await expect(page.getByRole('heading', { name: '旧相册迁移预览' })).toBeVisible()
      await expect(page.getByText(title, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '导入为新项目' }).click()
      await expect(page.locator('.project-identity')).toContainText(title)
      await page.getByRole('button', { name: '返回项目首页' }).click()
    }

    const jsonProject = JSON.parse(
      await readFile(join(userData, 'JSON 旧版夹具.album-project', 'manifest.json'), 'utf8')
    ) as AlbumProject
    const htmlProject = JSON.parse(
      await readFile(join(userData, 'HTML 旧版夹具.album-project', 'manifest.json'), 'utf8')
    ) as AlbumProject
    expect(jsonProject.assets).toHaveLength(1)
    expect(jsonProject.pages).toHaveLength(3)
    expect(JSON.stringify(jsonProject)).not.toContain('data:image')
    expect(htmlProject.themeId).toBe('film')
    expect(htmlProject.origin?.kind).toBe('legacy-html')
    const hashesAfter = await Promise.all(
      [jsonPath, htmlPath].map(async (path) =>
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex')
      )
    )
    expect(hashesAfter).toEqual(hashesBefore)
  })

  test('关闭窗口前提交仍在聚焦的标题', async () => {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: /端到端测试相册/ }).click()
    const titleInput = page.getByLabel('封面标题')
    await titleInput.fill('关闭前最后输入')
    await expect(titleInput).toBeFocused()
    const browserWindow = await app.browserWindow(page)
    await browserWindow.evaluate((window) => window.close()).catch(() => undefined)
    await expect
      .poll(async () => {
        const saved = JSON.parse(
          await readFile(join(userData, '端到端测试.album-project', 'manifest.json'), 'utf8')
        ) as AlbumProject
        return saved.title
      })
      .toBe('关闭前最后输入')
  })

  test('原图缺失后可用内容指纹安全恢复', async () => {
    const projectRoot = join(userData, '端到端测试.album-project')
    const project = JSON.parse(
      await readFile(join(projectRoot, 'manifest.json'), 'utf8')
    ) as AlbumProject
    const original = join(projectRoot, project.assets[0].originalRelativePath)
    const replacement = join(userData, '重新定位.png')
    await copyFile(original, replacement)
    await unlink(original)
    await app.evaluate(({ dialog }, replacementPath) => {
      Object.defineProperty(dialog, 'showOpenDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePaths: [replacementPath] })
      })
    }, replacement)

    const page = await app.firstWindow()
    await page.getByRole('button', { name: /端到端测试相册/ }).click()
    await page.getByText('第 1 页 · 1 张', { exact: true }).click()
    await expect(page.getByText(/文件缺失/).first()).toBeVisible()
    await page
      .getByRole('region', { name: '相册画布' })
      .getByRole('button', { name: '编辑照片 一像素测试照片.png' })
      .click()
    await page.getByRole('button', { name: '重新定位原图' }).click()
    await expect(page.getByText('照片已恢复。')).toBeVisible()
    expect((await readFile(original)).equals(TEST_PNG)).toBe(true)
  })

  test('三套主题覆盖封面与 1/2/4/6 图页', async ({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium')
    const page = await app.firstWindow()
    await page.getByRole('button', { name: /端到端测试相册/ }).click()
    const themes = [
      ['journal', '旅途手账'],
      ['postcard', '海风明信片'],
      ['film', '胶片画廊']
    ] as const
    const pages = [
      ['cover', '封面'],
      ['1', '第 1 页 · 1 张'],
      ['2', '第 2 页 · 2 张'],
      ['4', '第 3 页 · 4 张'],
      ['6', '第 4 页 · 6 张']
    ] as const
    for (const [themeId, themeName] of themes) {
      await page.getByRole('button', { name: '选择主题' }).click()
      await page.getByRole('radio', { name: new RegExp(themeName) }).click()
      await page.keyboard.press('Escape')
      for (const [count, pageLabel] of pages) {
        await page
          .getByRole('complementary', { name: '相册页面' })
          .getByRole('button', { name: pageLabel, exact: true })
          .click()
        await page.locator('.canvas-sheet').screenshot({
          path: testInfo.outputPath(`theme-${themeId}-${count}.png`)
        })
      }
    }
  })
})
