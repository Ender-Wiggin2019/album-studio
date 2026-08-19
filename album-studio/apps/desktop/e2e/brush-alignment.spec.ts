// 回归：消除人物工作区里涂刷笔划必须落在鼠标位置。
// 曾因遮罩 canvas 是绝对定位的 replaced 元素，inset-0 不会拉伸它，
// 画布按自身属性尺寸（boxWidth × devicePixelRatio）布局，在非 100% 缩放的
// Windows 上比照片框大 ~dpr 倍，导致笔划相对鼠标向右下偏移并被裁切。
// 运行：npm run test:e2e:packaged（先执行 build:unpack 生成打包产物）
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
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
const NOW = '2026-08-18T12:00:00.000Z'

test.skip(!existsSync(executable), '缺少打包产物，请先运行 npm run build:unpack')

test('涂刷笔划与鼠标位置一致（回归）', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'album-studio-brush-align-'))
  let child
  let browser
  let processCapture
  try {
    // 非正方形照片（800×600），能暴露任何非等比缩放导致的错位
    const image = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 160, g: 110, b: 80 } }
    })
      .png()
      .toBuffer()

    const projectRoot = join(userData, '涂刷对齐测试.album-project')
    const manifestPath = join(projectRoot, 'manifest.json')
    await mkdir(join(projectRoot, 'assets', 'original'), { recursive: true })
    await mkdir(join(projectRoot, 'assets', 'cache'), { recursive: true })
    const hash = createHash('sha256').update(image).digest('hex')
    const asset = {
      id: `asset-${hash}`,
      fileName: '涂刷对齐测试.png',
      contentHash: hash,
      mimeType: 'image/png',
      byteSize: image.byteLength,
      width: 800,
      height: 600,
      importedAt: NOW
    }
    await writeFile(join(projectRoot, 'assets', 'original', `${hash}.png`), image)
    let id = 0
    const ids = (): string => `seed-${++id}`
    let document: AlbumDocument = createAlbumDocument(
      { title: '涂刷对齐测试相册', themeId: 'journal', now: NOW },
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
    await page.getByRole('button', { name: /涂刷对齐测试相册/ }).click()
    await page
      .getByRole('complementary', { name: '相册页面' })
      .getByRole('button', { name: '第 1 页 · 1 个 Block', exact: true })
      .click()
    const imageElement = page
      .getByRole('region', { name: '相册画布' })
      .locator('[data-block-id^="seed-"]')
      .filter({ has: page.locator('img') })
    await imageElement.first().click()
    await page
      .getByRole('complementary', { name: '装帧托盘' })
      .getByRole('button', { name: '消除人物' })
      .click()
    const workspace = page.getByRole('region', { name: '消除人物' })
    const canvas = workspace.locator('[aria-label="人物遮罩涂刷区域"]')
    await canvas.waitFor({ state: 'visible', timeout: 30_000 })
    // 等 fitSize 布局与遮罩重绘完成
    await page.waitForTimeout(600)

    const rect = await canvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement
      const box = canvas.parentElement
      if (!box) throw new Error('找不到照片渲染框')
      const canvasRect = canvas.getBoundingClientRect()
      const boxRect = box.getBoundingClientRect()
      return {
        canvasRect: {
          left: canvasRect.left,
          top: canvasRect.top,
          width: canvasRect.width,
          height: canvasRect.height
        },
        boxRect: {
          left: boxRect.left,
          top: boxRect.top,
          width: boxRect.width,
          height: boxRect.height
        },
        bitmap: { width: canvas.width, height: canvas.height },
        dpr: window.devicePixelRatio
      }
    })
    console.log('布局诊断', JSON.stringify(rect))

    // 盒子与 canvas 必须完全重合
    expect(Math.abs(rect.canvasRect.left - rect.boxRect.left)).toBeLessThan(1)
    expect(Math.abs(rect.canvasRect.top - rect.boxRect.top)).toBeLessThan(1)
    expect(Math.abs(rect.canvasRect.width - rect.boxRect.width)).toBeLessThan(1)
    expect(Math.abs(rect.canvasRect.height - rect.boxRect.height)).toBeLessThan(1)

    const left = rect.canvasRect.left
    const top = rect.canvasRect.top
    const width = rect.canvasRect.width
    const height = rect.canvasRect.height

    // 依次在三个不同位置画短笔划（从 (x-30, y) 画到 (x, y)），
    // 每笔都验证笔划包围盒中心 ≈ 笔迹中点（x-15, y），即涂刷与鼠标一致。
    const probes = [
      { x: left + width * 0.25, y: top + height * 0.25 },
      { x: left + width * 0.5, y: top + height * 0.65 },
      { x: left + width * 0.75, y: top + height * 0.35 }
    ]
    for (const probe of probes) {
      // 增量绘制检查：按下并移动到目标点（尚未松开），此时画的是 drawSegment 路径
      await page.mouse.move(probe.x - 30, probe.y)
      await page.mouse.down()
      await page.mouse.move(probe.x, probe.y, { steps: 5 })
      const during = await readStroke(page)
      // 松手后提交 stroke，走 drawOverlay 全量重绘
      await page.mouse.up()
      await page.waitForTimeout(120)
      const after = await readStroke(page)

      const expectedX = probe.x - 15
      for (const [label, stroke] of [
        ['增量绘制中', during],
        ['提交重绘后', after]
      ] as const) {
        console.log(
          `笔划 ${label} @ (${probe.x.toFixed(1)}, ${probe.y.toFixed(1)})`,
          JSON.stringify(stroke)
        )
        expect(stroke.count).toBeGreaterThan(20)
        expect(Math.abs(stroke.center.x - expectedX)).toBeLessThanOrEqual(6)
        expect(Math.abs(stroke.center.y - probe.y)).toBeLessThanOrEqual(6)
      }

      // 清空遮罩，避免下一笔的包围盒混入旧笔划
      await workspace.getByRole('button', { name: '清除全部' }).click()
      await page.waitForTimeout(80)
      const cleared = await readStroke(page)
      expect(cleared.count).toBe(0)
    }

    expect(runtimeErrors).toEqual([])
    assertNoRendererStartupErrors(processCapture.output, ...runtimeErrors)
  } finally {
    await browser?.close().catch(() => undefined)
    await terminateProcessTree(child)
    await rm(userData, { recursive: true, force: true })
  }
})

async function readStroke(page): Promise<{
  count: number
  center: { x: number; y: number }
}> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[aria-label="人物遮罩涂刷区域"]')
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('找不到遮罩 canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('取不到 2d context')
    const w = canvas.width
    const h = canvas.height
    const data = ctx.getImageData(0, 0, w, h).data
    let minX = Infinity
    let minY = Infinity
    let maxX = -1
    let maxY = -1
    let count = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 0) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
          count++
        }
      }
    }
    const canvasRect = canvas.getBoundingClientRect()
    const toCss = (bx: number, by: number): { x: number; y: number } => ({
      x: (bx / w) * canvasRect.width + canvasRect.left,
      y: (by / h) * canvasRect.height + canvasRect.top
    })
    if (count === 0) return { count: 0, center: { x: 0, y: 0 } }
    return { count, center: toCss((minX + maxX) / 2, (minY + maxY) / 2) }
  })
}
