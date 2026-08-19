import {
  IMAGE_PIPELINE_VERSION,
  IPC_CHANNELS,
  ImageCropSchema,
  type AlbumStudioApi
} from '@album-studio/common'
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
    pickCandidates: (input) => ipcRenderer.invoke(IPC_CHANNELS.assetsPickCandidates, input),
    importCandidates: (input) => ipcRenderer.invoke(IPC_CHANNELS.assetsImportCandidates, input),
    releaseCandidates: (input) => ipcRenderer.invoke(IPC_CHANNELS.assetsReleaseCandidates, input),
    relink: (input) => ipcRenderer.invoke(IPC_CHANNELS.assetsRelink, input),
    url: (projectId, assetId, quality = 'preview', usage) => {
      const query = new URLSearchParams({
        quality,
        v: IMAGE_PIPELINE_VERSION
      })
      if (usage?.width !== undefined) query.set('width', String(usage.width))
      if (usage?.height !== undefined) query.set('height', String(usage.height))
      if (usage?.crop !== undefined)
        query.set('crop', JSON.stringify(ImageCropSchema.parse(usage.crop)))
      if (usage?.eraseKey !== undefined) query.set('erase', usage.eraseKey)
      return `album-asset://project/${encodeURIComponent(projectId)}/${encodeURIComponent(assetId)}?${query.toString()}`
    }
  }),
  imageErase: Object.freeze({
    detect: (input) => ipcRenderer.invoke(IPC_CHANNELS.imageEraseDetect, input),
    apply: (input) => ipcRenderer.invoke(IPC_CHANNELS.imageEraseApply, input)
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
