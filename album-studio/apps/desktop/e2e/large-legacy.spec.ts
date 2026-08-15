import { _electron as electron, expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { AlbumProject } from '@album-studio/common'

const sourcePath = process.env.ALBUM_STUDIO_LARGE_LEGACY
const desktopRoot = resolve(__dirname, '..')

test('185 张旧相册迁移并导出 48 页 PDF', async ({ browserName }, testInfo) => {
  test.skip(!sourcePath, '设置 ALBUM_STUDIO_LARGE_LEGACY 后运行本地私有大样本验收。')
  expect(browserName).toBe('chromium')
  const userData = await mkdtemp(join(tmpdir(), 'album-studio-large-'))
  const outputPdf = testInfo.outputPath('large-legacy-48-pages.pdf')
  const sourceHashBefore = createHash('sha256')
    .update(await readFile(sourcePath!))
    .digest('hex')
  const app = await electron.launch({
    args: [desktopRoot],
    cwd: desktopRoot,
    env: { ...process.env, ALBUM_STUDIO_USER_DATA_DIR: userData }
  })
  try {
    await app.evaluate(
      ({ dialog }, routes) => {
        Object.defineProperty(dialog, 'showOpenDialog', {
          configurable: true,
          value: async (...args: unknown[]) => {
            const options = args.at(-1) as { title?: string }
            return {
              canceled: false,
              filePaths: [options.title === '导入旧相册' ? routes.source : routes.destination]
            }
          }
        })
        Object.defineProperty(dialog, 'showSaveDialog', {
          configurable: true,
          value: async () => ({ canceled: false, filePath: routes.pdf })
        })
      },
      { source: sourcePath!, destination: userData, pdf: outputPdf }
    )
    const page = await app.firstWindow()
    await page.getByRole('button', { name: '导入旧相册' }).click()
    await expect(page.getByRole('heading', { name: '旧相册迁移预览' })).toBeVisible({
      timeout: 180_000
    })
    await expect(page.getByText('185', { exact: true })).toBeVisible()
    await expect(page.getByText('48', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '导入为新项目' }).click()
    await expect(page.locator('.project-identity')).toContainText('2026年6月旅游', {
      timeout: 300_000
    })

    const manifestPath = join(userData, '2026年6月旅游.album-project', 'manifest.json')
    const project = JSON.parse(await readFile(manifestPath, 'utf8')) as AlbumProject
    const placements = project.pages.reduce(
      (total, albumPage) => total + (albumPage.kind === 'content' ? albumPage.slots.length : 0),
      0
    )
    expect(project.assets).toHaveLength(131)
    expect(project.pages).toHaveLength(48)
    expect(placements).toBe(185)
    expect(JSON.stringify(project)).not.toContain('data:image')
    const firstAsset = project.assets[0]
    expect(
      (
        await readFile(
          join(userData, '2026年6月旅游.album-project', firstAsset.originalRelativePath)
        )
      ).length
    ).toBeGreaterThan(0)
    const assetUrl = `album-asset://project/${encodeURIComponent(project.id)}/${encodeURIComponent(firstAsset.id)}?quality=original`
    const protocolResponse = await app.evaluate(async ({ net }, url) => {
      const response = await net.fetch(url)
      return { status: response.status, body: await response.text() }
    }, assetUrl)
    expect(protocolResponse.status, protocolResponse.body).toBe(200)
    const assetImage = await page.evaluate(
      ({ projectId, assetId }) =>
        new Promise<{ loaded: boolean; width: number; height: number }>((resolveImage) => {
          const image = new Image()
          image.onload = () =>
            resolveImage({ loaded: true, width: image.naturalWidth, height: image.naturalHeight })
          image.onerror = () => resolveImage({ loaded: false, width: 0, height: 0 })
          image.src = window.albumStudio.assets.url(projectId, assetId, 'original')
        }),
      { projectId: project.id, assetId: firstAsset.id }
    )
    expect(assetImage).toEqual({
      loaded: true,
      width: firstAsset.width,
      height: firstAsset.height
    })
    expect(
      createHash('sha256')
        .update(await readFile(sourcePath!))
        .digest('hex')
    ).toBe(sourceHashBefore)

    await page.getByRole('button', { name: '导出 PDF' }).click()
    await expect(page.getByText('PDF 已导出', { exact: true })).toBeVisible({ timeout: 300_000 })
    expect((await readFile(outputPdf)).subarray(0, 5).toString('ascii')).toBe('%PDF-')
    const metrics = await app.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .map(({ type, memory }) => ({ type, workingSetSize: memory.workingSetSize }))
    )
    await testInfo.attach('process-memory.json', {
      body: Buffer.from(JSON.stringify(metrics, null, 2)),
      contentType: 'application/json'
    })
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined)
    await app.close().catch(() => undefined)
    if (!process.env.ALBUM_STUDIO_KEEP_LARGE_TEMP) {
      await rm(userData, { recursive: true, force: true })
    }
  }
})
