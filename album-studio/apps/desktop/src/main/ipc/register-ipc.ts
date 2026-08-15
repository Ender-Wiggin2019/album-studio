import { IPC_CHANNELS, SaveProjectRequestSchema, ThemeIdSchema } from '@album-studio/common'
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { AssetService } from '../assets/asset-service'
import type { PdfExporter } from '../export/pdf-exporter'
import type { LegacyAlbumImporter } from '../legacy/legacy-importer'
import type { ProjectRepository } from '../projects/project-repository'

type Services = {
  projects: ProjectRepository
  assets: AssetService
  legacy: LegacyAlbumImporter
  pdf: PdfExporter
  onCloseReady: (ok: boolean) => void
}

function requireMainWindow(event: IpcMainInvokeEvent, window: BrowserWindow): void {
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    window.isDestroyed()
  ) {
    throw new Error('已拒绝来自非主窗口的请求。')
  }
}

export function registerIpc(window: BrowserWindow, services: Services): () => void {
  const handle = <T extends unknown[]>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: T) => unknown
  ): void => {
    ipcMain.handle(channel, (event, ...args: T) => {
      requireMainWindow(event, window)
      return handler(event, ...args)
    })
  }

  handle(IPC_CHANNELS.projectsListRecent, () => services.projects.listRecent())
  handle(IPC_CHANNELS.projectsCreate, (_event, input: unknown) => {
    const parsed = z
      .object({ title: z.string().min(1).max(160), themeId: ThemeIdSchema })
      .parse(input)
    return services.projects.createWithDialog(window, parsed)
  })
  handle(IPC_CHANNELS.projectsChooseAndOpen, () => services.projects.chooseAndOpen(window))
  handle(IPC_CHANNELS.projectsOpenPath, (_event, projectPath: unknown) =>
    services.projects.openRecent(z.string().min(1).parse(projectPath))
  )
  handle(IPC_CHANNELS.projectsSave, (_event, input: unknown) => {
    const request = SaveProjectRequestSchema.parse(input)
    return services.projects.save(request.projectPath, request.project)
  })
  handle(IPC_CHANNELS.assetsImport, (_event, input: unknown) =>
    services.assets.chooseAndImport(window, input)
  )
  handle(IPC_CHANNELS.assetsRelink, (_event, input: unknown) =>
    services.assets.chooseAndRelink(window, input)
  )
  handle(IPC_CHANNELS.legacyChooseAndInspect, () => services.legacy.chooseAndInspect(window))
  handle(IPC_CHANNELS.legacyCommit, (_event, input: unknown) =>
    services.legacy.commit(window, input)
  )
  handle(IPC_CHANNELS.exportPdf, (_event, input: unknown) => services.pdf.export(window, input))
  handle(IPC_CHANNELS.appCloseReady, (_event, input: unknown) => {
    const result = z.object({ ok: z.boolean(), error: z.string().optional() }).parse(input)
    services.onCloseReady(result.ok)
  })

  return () => {
    for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel)
  }
}
