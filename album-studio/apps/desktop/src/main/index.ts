import { IPC_CHANNELS } from '@album-studio/common'
import { app, BrowserWindow, session } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AssetService } from './assets/asset-service'
import { PdfExporter } from './export/pdf-exporter'
import { registerIpc } from './ipc/register-ipc'
import { LegacyAlbumImporter } from './legacy/legacy-importer'
import { ProjectRepository } from './projects/project-repository'
import { handleAssetProtocol, registerAssetScheme } from './protocol/asset-protocol'

const isolatedUserData = process.env.ALBUM_STUDIO_USER_DATA_DIR
if (!app.isPackaged && isolatedUserData) app.setPath('userData', isolatedUserData)

registerAssetScheme()
app.enableSandbox()

let projects: ProjectRepository
let assets: AssetService
let legacy: LegacyAlbumImporter
let pdf: PdfExporter

function installContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const connectSource = is.dev ? "'self' album-asset: ws: http: https:" : "'self' album-asset:"
    const policy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' album-asset: data: blob:",
      "font-src 'self' data:",
      `connect-src ${connectSource}`,
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'"
    ].join('; ')
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: '电子相册工作室',
    backgroundColor: '#171a1f',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  let allowClose = false
  let closeRequestPending = false
  const unregisterIpc = registerIpc(mainWindow, {
    projects,
    assets,
    legacy,
    pdf,
    onCloseReady: (ok) => {
      closeRequestPending = false
      if (!ok || mainWindow.isDestroyed()) return
      allowClose = true
      mainWindow.close()
    }
  })
  mainWindow.on('close', (event) => {
    if (allowClose) return
    if (mainWindow.webContents.isDestroyed()) {
      allowClose = true
      return
    }
    event.preventDefault()
    if (closeRequestPending) return
    closeRequestPending = true
    mainWindow.webContents.send(IPC_CHANNELS.appCloseRequest)
  })
  mainWindow.once('closed', unregisterIpc)
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.albumstudio.desktop')
  installContentSecurityPolicy()

  projects = new ProjectRepository()
  assets = new AssetService(projects)
  legacy = new LegacyAlbumImporter(projects)
  pdf = new PdfExporter(projects)
  handleAssetProtocol(projects)

  app.on('browser-window-created', (_event, window) => {
    if (is.dev) optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
