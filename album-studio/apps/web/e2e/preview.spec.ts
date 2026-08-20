import { expect, test, type Page, type TestInfo } from '@playwright/test'

type Rect = Readonly<{
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}>

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

async function createPreviewProject(page: Page, portrait: boolean): Promise<void> {
  await page.getByRole('button', { name: '新建相册' }).first().click()
  await page.getByLabel('相册名称').fill(portrait ? '竖排书本预览' : '横向书本预览')
  if (portrait) await page.getByRole('radio', { name: /A4 竖排/ }).click()
  await page.getByRole('button', { name: '创建相册' }).click()
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: '添加页面', exact: true }).click()
  }
  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
}

function overlaps(first: Rect, second: Rect): boolean {
  return (
    Math.min(first.right, second.right) - Math.max(first.left, second.left) > 1 &&
    Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 1
  )
}

async function expectPreviewGeometry(
  page: Page,
  expectedPageCount: number,
  placement: 'left' | 'bottom'
): Promise<void> {
  const geometry = await page.evaluate(() => {
    const rect = (element: Element): Rect => {
      const bounds = element.getBoundingClientRect()
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width
      }
    }
    const stage = document.querySelector('[data-preview-stage]')
    const rail = document.querySelector('nav[aria-label="预览页面"]')
    const pages = [...document.querySelectorAll('.preview-book-base .preview-book-page')]
      .filter((element) => element.hasAttribute('data-preview-page-index'))
      .map(rect)
    const buttons = [...document.querySelectorAll('[data-preview-stage] button')].map(rect)
    if (!stage || !rail) throw new Error('预览几何节点缺失')
    return {
      stage: rect(stage),
      rail: rect(rail),
      pages,
      buttons,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth
    }
  })

  expect(geometry.pages).toHaveLength(expectedPageCount)
  for (const pageRect of geometry.pages) {
    expect(pageRect.width).toBeGreaterThan(0)
    expect(pageRect.height).toBeGreaterThan(0)
    expect(pageRect.left).toBeGreaterThanOrEqual(geometry.stage.left - 1)
    expect(pageRect.right).toBeLessThanOrEqual(geometry.stage.right + 1)
    expect(pageRect.top).toBeGreaterThanOrEqual(geometry.stage.top - 1)
    expect(pageRect.bottom).toBeLessThanOrEqual(geometry.stage.bottom + 1)
    for (const buttonRect of geometry.buttons) expect(overlaps(pageRect, buttonRect)).toBe(false)
  }
  if (placement === 'left') {
    expect(geometry.rail.right).toBeLessThanOrEqual(geometry.stage.left + 1)
  } else {
    expect(geometry.rail.top).toBeGreaterThanOrEqual(geometry.stage.bottom - 1)
  }
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1)
}

async function verifyPreviewAtViewports(
  page: Page,
  testInfo: TestInfo,
  portrait: boolean
): Promise<void> {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1100, height: 720 },
    { width: 800, height: 640 }
  ]) {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: '预览整册' }).click()
    const workspace = page.getByRole('region', { name: '整册预览' })
    await expect(workspace).toHaveAttribute('data-preview-mode', 'double')
    await expect(workspace).toHaveAttribute(
      'data-page-orientation',
      portrait ? 'portrait' : 'landscape'
    )
    await expect(page.getByRole('navigation', { name: '预览页面' })).toHaveAttribute(
      'data-placement',
      portrait ? 'left' : 'bottom'
    )

    await page.getByRole('button', { name: '封面' }).click()
    await expect(workspace).toHaveAttribute('data-preview-state', 'idle')
    if (viewport.width === 1440) {
      await page.screenshot({
        path: testInfo.outputPath(`preview-${portrait ? 'portrait' : 'landscape'}-cover.png`)
      })
    }
    await expect(page.locator('.preview-book-base .preview-blank-page')).not.toBeVisible()
    await expectPreviewGeometry(page, 1, portrait ? 'left' : 'bottom')
    await page.getByRole('button', { name: '下一页' }).click()
    await expect(workspace).toHaveAttribute('data-preview-state', 'flipping')
    if (viewport.width === 1440) {
      await page.waitForTimeout(180)
      await page.screenshot({
        path: testInfo.outputPath(`preview-${portrait ? 'portrait' : 'landscape'}-turning.png`)
      })
    }
    await expect(workspace).toHaveAttribute('data-preview-state', 'idle')
    await expectPreviewGeometry(page, 2, portrait ? 'left' : 'bottom')
    await page.screenshot({
      path: testInfo.outputPath(
        `preview-${portrait ? 'portrait' : 'landscape'}-double-${viewport.width}x${viewport.height}.png`
      )
    })

    await page.getByRole('button', { name: '下一页' }).click()
    await expect(workspace).toHaveAttribute('data-preview-state', 'flipping')
    await expect(workspace).toHaveAttribute('data-preview-state', 'idle')
    await expectPreviewGeometry(page, 1, portrait ? 'left' : 'bottom')
    await expect(page.locator('.preview-book-base .preview-blank-page')).toBeVisible()

    await page.getByRole('button', { name: '上一页' }).click()
    await expect(workspace).toHaveAttribute('data-preview-state', 'flipping')
    await expect(workspace).toHaveAttribute('data-preview-state', 'idle')

    await page.getByRole('radio', { name: '单页' }).click()
    await expect(workspace).toHaveAttribute('data-preview-mode', 'single')
    await expectPreviewGeometry(page, 1, portrait ? 'left' : 'bottom')

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: '下一页' }).click()
    await expect(workspace).toHaveAttribute('data-preview-state', 'idle')
    await expect(page.locator('.preview-turn-sheet')).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath(
        `preview-${portrait ? 'portrait' : 'landscape'}-single-${viewport.width}x${viewport.height}.png`
      )
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByRole('button', { name: '退出预览' }).click()
    await expect(page.getByRole('button', { name: '预览整册' })).toBeVisible()
  }

  expect(errors).toEqual([])
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

test('A4 竖排预览在三种视口保持左侧轨道与完整单双页', async ({ page }, testInfo) => {
  await createPreviewProject(page, true)
  await verifyPreviewAtViewports(page, testInfo, true)
})

test('A4 横向预览在三种视口保持底部轨道与完整单双页', async ({ page }, testInfo) => {
  await createPreviewProject(page, false)
  await verifyPreviewAtViewports(page, testInfo, false)
})
