import { IPC_CHANNELS, type AlbumStudioApi } from '@album-studio/common'
import { contextBridge, ipcRenderer } from 'electron'

const api: AlbumStudioApi = Object.freeze({
  projects: Object.freeze({
    listRecent: () => ipcRenderer.invoke(IPC_CHANNELS.projectsListRecent),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsCreate, input),
    chooseAndOpen: () => ipcRenderer.invoke(IPC_CHANNELS.projectsChooseAndOpen),
    openPath: (projectPath) => ipcRenderer.invoke(IPC_CHANNELS.projectsOpenPath, projectPath),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.projectsSave, input)
  }),
  assets: Object.freeze({
    import: (input) => ipcRenderer.invoke(IPC_CHANNELS.assetsImport, input),
    relink: (input) => ipcRenderer.invoke(IPC_CHANNELS.assetsRelink, input),
    url: (projectId, assetId, quality = 'preview') =>
      `album-asset://project/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}?quality=${quality}`
  }),
  legacy: Object.freeze({
    chooseAndInspect: () => ipcRenderer.invoke(IPC_CHANNELS.legacyChooseAndInspect),
    commit: (input) => ipcRenderer.invoke(IPC_CHANNELS.legacyCommit, input)
  }),
  export: Object.freeze({
    pdf: (input) => ipcRenderer.invoke(IPC_CHANNELS.exportPdf, input)
  }),
  system: Object.freeze({
    platform: process.platform,
    versions: Object.freeze({
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    }),
    onCloseRequest: (listener) => {
      const handler = (): void => listener()
      ipcRenderer.on(IPC_CHANNELS.appCloseRequest, handler)
      return () => ipcRenderer.removeListener(IPC_CHANNELS.appCloseRequest, handler)
    },
    closeReady: (input) => ipcRenderer.invoke(IPC_CHANNELS.appCloseReady, input)
  })
})

contextBridge.exposeInMainWorld('albumStudio', api)
