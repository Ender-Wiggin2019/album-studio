import {
  ExportPdfRequestSchema,
  pageSpecSizeInInches,
  type ExportPdfResult,
  type PageSpec
} from '@album-studio/common'
import { dialog, type BrowserWindow, type Size } from 'electron'
import { rename, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { ProjectRepository } from '../projects/project-repository'

export function pdfPageSizeForPageSpec(pageSpec: PageSpec): Size {
  return pageSpecSizeInInches(pageSpec)
}

function safePdfName(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, 100)
  return `${cleaned || '电子相册'}.pdf`
}

export class PdfExporter {
  constructor(private readonly projects: ProjectRepository) {}

  async export(window: BrowserWindow, input: unknown): Promise<ExportPdfResult | null> {
    const request = ExportPdfRequestSchema.parse(input)
    const registration = this.projects.getRegisteredProjectByPath(request.projectPath)
    if (registration.document.revision !== request.revision) {
      throw new Error('项目仍有未保存的更改，请等待保存完成后再导出。')
    }

    const selection = await dialog.showSaveDialog(window, {
      title: '导出整册 PDF',
      buttonLabel: '导出 PDF',
      defaultPath: safePdfName(request.suggestedName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (selection.canceled || !selection.filePath) return null
    const outputPath =
      extname(selection.filePath).toLowerCase() === '.pdf'
        ? selection.filePath
        : `${selection.filePath}.pdf`
    const partialPath = join(dirname(outputPath), `.${basename(outputPath)}.${process.pid}.partial`)

    await window.webContents.executeJavaScript(`(async () => {
      await document.fonts.ready;
      const images = Array.from(document.querySelectorAll('[data-print-book] img'));
      await Promise.all(images.map((image) => image.complete ? image.decode().catch(() => undefined) : new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })));
      return true;
    })()`)

    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: false,
      pageSize: pdfPageSizeForPageSpec(registration.document.pageSpec),
      margins: { top: 0, right: 0, bottom: 0, left: 0 }
    })
    try {
      await writeFile(partialPath, pdf)
      await rename(partialPath, outputPath)
    } catch (error) {
      await unlink(partialPath).catch(() => undefined)
      throw error
    }
    const file = await stat(outputPath)
    return { path: outputPath, byteSize: file.size }
  }
}
