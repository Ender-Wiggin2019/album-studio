import { expect, test, type Page } from '@playwright/test'
import type { AlbumDocument, AlbumTextNode } from '@album-studio/common'

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

function textNodes(document: AlbumDocument, blockId: string): AlbumTextNode[] {
  for (const page of document.pages) {
    const block = page.blocks.find((candidate) => candidate.id === blockId)
    if (block?.type !== 'rich-text') continue
    return block.document.root.children.flatMap((node) =>
      node.type === 'paragraph' ? node.children : node.children.flatMap((item) => item.children)
    )
  }
  throw new Error('找不到目标文字 Block')
}

function firstTextNode(document: AlbumDocument, blockId: string): AlbumTextNode {
  const textNode = textNodes(document, blockId)[0]
  if (textNode) return textNode
  throw new Error('找不到目标文字节点')
}

async function setNativeColor(page: Page, color: string): Promise<void> {
  await page.getByLabel('文字颜色').evaluate((element, value) => {
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, color)
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

test('富文本整块格式、特色中文字体与项目颜色可保存并刷新恢复', async ({ page }) => {
  await page.getByRole('button', { name: '新建相册' }).first().click()
  await page.getByLabel('相册名称').fill('富文本颜色字体回归')
  await page.getByRole('button', { name: '创建相册' }).click()

  const initialDocument = await readOnlyManifest(page)
  const titleBlock = initialDocument.pages[0]?.blocks[0]
  if (titleBlock?.type !== 'rich-text') throw new Error('封面标题不是 RichTextBlock')

  const canvas = page.getByRole('region', { name: '相册画布' })
  await canvas.getByRole('button', { name: '选择文字' }).first().click()
  await expect(page.getByRole('textbox', { name: '富文本内容' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '富文本内容' })).not.toBeFocused()

  await page.getByRole('spinbutton', { name: '字号' }).fill('72')
  await setNativeColor(page, '#c62828')
  await page.getByRole('combobox', { name: '字体' }).click()
  await expect(page.getByText('特色字体', { exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '霞鹜文楷' })).toBeVisible()
  await expect(page.getByRole('option', { name: '霞鹜漫黑' })).toBeVisible()
  await expect(page.getByRole('option', { name: '小赖字体' })).toBeVisible()
  await page.getByRole('option', { name: '得意黑' }).click()

  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const text = firstTextNode(document, titleBlock.id)
      return {
        color: text.color,
        fontFamily: text.fontFamily,
        fontSize: text.fontSize,
        recentColors: document.recentColors
      }
    })
    .toEqual({
      color: '#c62828',
      fontFamily: 'smiley-sans',
      fontSize: 72,
      recentColors: ['#c62828']
    })

  await expect
    .poll(() =>
      page.evaluate(async () => {
        const families = [
          'Album Smiley Sans',
          'Album LXGW WenKai Lite',
          'Album LXGW Marker Gothic',
          'Album Xiaolai'
        ]
        await Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`, '字体')))
        return families.every((family) => document.fonts.check(`16px "${family}"`, '字体'))
      })
    )
    .toBe(true)

  const physicalRatio = await page
    .locator(`[data-block-id="${titleBlock.id}"] span`)
    .first()
    .evaluate((span) => {
      const pageElement = span.closest('.album-page')
      if (!pageElement) throw new Error('文字不在相册页面内')
      return Number.parseFloat(getComputedStyle(span).fontSize) / pageElement.clientWidth
    })
  expect(physicalRatio).toBeCloseTo(25.4 / 297, 3)

  await setNativeColor(page, '#1565c0')
  await expect
    .poll(async () => (await readOnlyManifest(page)).recentColors)
    .toEqual(['#1565c0', '#c62828'])
  await page.getByRole('radio', { name: '使用项目颜色 #c62828' }).click()
  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      return {
        color: firstTextNode(document, titleBlock.id).color,
        recentColors: document.recentColors
      }
    })
    .toEqual({ color: '#c62828', recentColors: ['#c62828', '#1565c0'] })

  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.project-identity')).toContainText('富文本颜色字体回归')
  await canvas.getByRole('button', { name: '选择文字' }).first().click()
  await expect(page.getByRole('radio', { name: '使用项目颜色 #c62828' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '使用项目颜色 #1565c0' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '字体' })).toContainText('得意黑')

  const reloadedEditor = page.getByRole('textbox', { name: '富文本内容' })
  await reloadedEditor.click()
  await page.keyboard.press('Home')
  await page.keyboard.down('Shift')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.up('Shift')
  await setNativeColor(page, '#2e7d32')
  await expect
    .poll(async () => {
      const nodes = textNodes(await readOnlyManifest(page), titleBlock.id)
      return nodes.map(({ text, color }) => ({ text, color }))
    })
    .toEqual([
      { text: '富', color: '#2e7d32' },
      { text: '文本颜色字体回归', color: '#c62828' }
    ])

  for (const viewport of [
    { width: 1100, height: 720 },
    { width: 800, height: 640 }
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(async () => {
        const box = await page.getByRole('toolbar', { name: '文字格式' }).boundingBox()
        return box
          ? { leftInside: box.x >= 0, rightInside: box.x + box.width <= viewport.width }
          : null
      })
      .toEqual({ leftInside: true, rightInside: true })
    await expect(page.getByRole('group', { name: '项目颜色' })).toBeVisible()
  }
})

test('文字 Block 可切换竖排并在预览、撤销重做和刷新后保持', async ({ page }) => {
  await page.getByRole('button', { name: '新建相册' }).first().click()
  await page.getByLabel('相册名称').fill('竖排回归')
  await page.getByRole('button', { name: '创建相册' }).click()

  const initialDocument = await readOnlyManifest(page)
  const titleBlock = initialDocument.pages[0]?.blocks[0]
  if (titleBlock?.type !== 'rich-text') throw new Error('封面标题不是 RichTextBlock')

  const canvas = page.getByRole('region', { name: '相册画布' })
  await canvas.getByRole('button', { name: '选择文字' }).first().click()
  const editor = page.getByRole('textbox', { name: '富文本内容' })
  await editor.fill('春日 Album 2026')
  await page.getByRole('radio', { name: '竖排' }).click()

  const renderedTitle = canvas.locator(`[data-block-id="${titleBlock.id}"] .album-rich-text-block`)
  await expect(page.getByRole('radio', { name: '竖排' })).toBeChecked()
  await expect(editor).toHaveAttribute('data-writing-mode', 'vertical')
  const editorMetrics = await editor.evaluate((element) => ({
    clientWidth: element.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflowX: getComputedStyle(element).overflowX,
    scrollWidth: element.scrollWidth,
    viewportWidth: window.innerWidth
  }))
  expect(editorMetrics.clientWidth).toBeLessThanOrEqual(360)
  expect(editorMetrics.scrollWidth).toBeGreaterThanOrEqual(editorMetrics.clientWidth)
  expect(editorMetrics.overflowX).toBe('auto')
  expect(editorMetrics.documentWidth).toBeLessThanOrEqual(editorMetrics.viewportWidth)
  await expect(renderedTitle).toHaveAttribute('data-writing-mode', 'vertical')
  await expect
    .poll(() =>
      renderedTitle.evaluate((element) => {
        const style = getComputedStyle(element)
        return { writingMode: style.writingMode, textOrientation: style.textOrientation }
      })
    )
    .toEqual({ writingMode: 'vertical-rl', textOrientation: 'upright' })
  await expect
    .poll(async () => {
      const document = await readOnlyManifest(page)
      const block = document.pages[0]?.blocks.find((candidate) => candidate.id === titleBlock.id)
      return {
        text: textNodes(document, titleBlock.id)
          .map((node) => node.text)
          .join(''),
        writingMode: block?.type === 'rich-text' ? block.writingMode : null
      }
    })
    .toEqual({ text: '春日 Album 2026', writingMode: 'vertical' })

  await page.getByRole('button', { name: '撤销' }).click()
  await expect(page.getByRole('radio', { name: '横排' })).toBeChecked()
  await expect(renderedTitle).toHaveAttribute('data-writing-mode', 'horizontal')
  await page.getByRole('button', { name: '重做' }).click()
  await expect(page.getByRole('radio', { name: '竖排' })).toBeChecked()
  await expect(renderedTitle).toHaveAttribute('data-writing-mode', 'vertical')

  await page.getByRole('button', { name: '预览整册' }).click()
  await expect(
    page.locator(`[data-block-id="${titleBlock.id}"] .album-rich-text-block`).first()
  ).toHaveAttribute('data-writing-mode', 'vertical')
  await page.keyboard.press('Escape')

  await expect(page.getByText('已保存', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.locator('.project-identity')).toContainText('竖排回归')
  await canvas.getByRole('button', { name: '选择文字' }).first().click()
  await expect(page.getByRole('radio', { name: '竖排' })).toBeChecked()
  await expect(page.getByRole('textbox', { name: '富文本内容' })).toHaveAttribute(
    'data-writing-mode',
    'vertical'
  )
})
