// 打包应用（dist/win-unpacked）的消除人物全流程验证：
// 证明打包态下模型从 process.resourcesPath/models 加载、修补并写入 manifest。
// 运行：npm run test:e2e:packaged（先执行 build:unpack 生成打包产物）
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import {
  createAlbumDocument,
  executeAlbumCommand,
  type AlbumCommand,
  type AlbumDocument
} from '@album-studio/common'
import {
  assertNoRendererStartupErrors,
  captureProcess,
  connectToRenderer,
  reservePort,
  terminateProcessTree
} from '../scripts/smoke-runtime.mjs'

const desktopRoot = resolve(__dirname, '..')
const executable = join(desktopRoot, 'dist', 'win-unpacked', 'album-studio.exe')
const fixtureImagePath = join(desktopRoot, 'build', 'icon.png')
const NOW = '2026-08-18T12:00:00.000Z'

test.skip(!existsSync(executable), '缺少打包产物，请先运行 npm run build:unpack')

test('打包应用可从资源目录加载模型并完成消除人物全流程', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'album-studio-erase-package-'))
  let child
  let browser
  let processCapture
  try {
    // 种子项目（与 smoke.spec.ts 相同的受测路径）
    const projectRoot = join(userData, '打包消除测试.album-project')
    const manifestPath = join(projectRoot, 'manifest.json')
    await mkdir(join(projectRoot, 'assets', 'original'), { recursive: true })
    await mkdir(join(projectRoot, 'assets', 'cache'), { recursive: true })
    const image = await readFile(fixtureImagePath)
    const hash = createHash('sha256').update(image).digest('hex')
    const asset = {
      id: `asset-${hash}`,
      fileName: '打包测试照片.png',
      contentHash: hash,
      mimeType: 'image/png',
      byteSize: image.byteLength,
      width: 512,
      height: 512,
      importedAt: NOW
    }
    await writeFile(join(projectRoot, 'assets', 'original', `${hash}.png`), image)
    let id = 0
    const ids = (): string => `pkg-${++id}`
    let document: AlbumDocument = createAlbumDocument(
      { title: '打包消除测试相册', themeId: 'journal', now: NOW },
      ids
    )
    const apply = (command: AlbumCommand): void => {
      document = executeAlbumCommand(document, command, { idFactory: ids, now: NOW }).document
    }
    apply({ type: 'register-assets', assets: [asset] })
    apply({ type: 'add-page', assetIds: [asset.id], layoutId: 'focus' })
    await writeFile(manifestPath, `${JSON.stringify(document, null, 2)}\n`)
    await writeFile(
      join(userData, 'recent-projects.json'),
      `${JSON.stringify(
        [
          {
            id: document.id,
            title: document.title,
            path: projectRoot,
            updatedAt: NOW,
            themeId: document.themeId,
            missing: false
          }
        ],
        null,
        2
      )}\n`
    )

    const port = await reservePort()
    child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
      detached: true,
      env: {
        ...process.env,
        ALBUM_STUDIO_USER_DATA_DIR: userData,
        ALBUM_STUDIO_STARTUP_SMOKE: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    processCapture = captureProcess(child)
    const connected = await connectToRenderer(port, 30_000, processCapture)
    browser = connected.browser
    const page = connected.page
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.stack ?? error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })

    await page.locator('#root > *').first().waitFor({ state: 'attached', timeout: 30_000 })
    await page.getByRole('button', { name: /打包消除测试相册/ }).click()
    await page
      .getByRole('complementary', { name: '相册页面' })
      .getByRole('button', { name: '第 1 页 · 1 个 Block', exact: true })
      .click()
    const imageElement = page
      .getByRole('region', { name: '相册画布' })
      .locator('[data-block-id^="pkg-"]')
      .filter({ has: page.locator('img') })
    await imageElement.first().click()
    await page
      .getByRole('complementary', { name: '装帧托盘' })
      .getByRole('button', { name: '消除人物' })
      .click()
    const workspace = page.getByRole('region', { name: '消除人物' })
    await workspace.getByRole('button', { name: '自动识别人物' }).click()
    await expect(workspace.getByRole('button', { name: /已识别/ })).toBeVisible({ timeout: 30_000 })
    await workspace.getByRole('button', { name: '应用消除' }).click()
    await expect(workspace.getByRole('button', { name: '确认应用' })).toBeVisible({
      timeout: 60_000
    })
    await workspace.getByRole('button', { name: '确认应用' }).click()

    await expect
      .poll(
        async () => {
          const saved = JSON.parse(await readFile(manifestPath, 'utf8')) as AlbumDocument
          const contentPage = saved.pages.find((candidate) => candidate.kind === 'content')
          const imageBlock = contentPage?.blocks.find((candidate) => candidate.type === 'image')
          return imageBlock?.type === 'image' ? imageBlock.erase : undefined
        },
        { timeout: 15_000 }
      )
      .toMatchObject({ autoDetect: true })
    expect(runtimeErrors).toEqual([])
    assertNoRendererStartupErrors(processCapture.output, ...runtimeErrors)
  } finally {
    await browser?.close().catch(() => undefined)
    await terminateProcessTree(child)
    await rm(userData, { recursive: true, force: true })
  }
})
