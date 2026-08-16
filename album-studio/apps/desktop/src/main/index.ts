import { IPC_CHANNELS } from '@album-studio/common'
import { app, BrowserWindow, clipboard, dialog, session } from 'electron'
import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { AssetService } from './assets/asset-service'
import { PdfExporter } from './export/pdf-exporter'
import { registerIpc } from './ipc/register-ipc'
import { ProjectRepository } from './projects/project-repository'
import { handleAssetProtocol, registerAssetScheme } from './protocol/asset-protocol'
import { buildContentSecurityPolicy } from './security/content-security-policy'

const isolatedUserData = process.env.ALBUM_STUDIO_USER_DATA_DIR
if (!app.isPackaged && isolatedUserData) app.setPath('userData', isolatedUserData)
const development = !app.isPackaged && is.dev

registerAssetScheme()
app.enableSandbox()

let projects: ProjectRepository
let assets: AssetService
let pdf: PdfExporter
let startupFailure: Promise<void> | undefined

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function reportStartupFailure(summary: string, detail: string): Promise<void> {
  console.error(`[电子相册工作室] ${summary}\n${detail}`)
  if (startupFailure) return startupFailure

  startupFailure = (async () => {
    if (process.env.ALBUM_STUDIO_STARTUP_SMOKE !== '1') {
      const fullError = `${summary}\n\n${detail}`
      const { response } = await dialog.showMessageBox({
        type: 'error',
        title: '电子相册工作室启动失败',
        message: summary,
        detail: `${detail}\n\n请复制错误信息并发给开发人员。`,
        buttons: ['复制错误并退出', '退出'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })
      if (response === 0) clipboard.writeText(fullError)
    }

    for (const window of BrowserWindow.getAllWindows()) window.destroy()
    app.exit(1)
  })().catch((error) => {
    console.error(`[电子相册工作室] 无法显示启动错误：${errorMessage(error)}`)
    app.exit(1)
  })

  return startupFailure
}

function installContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildContentSecurityPolicy({ development })]
      }
    })
  })
}

async function createWindow(): Promise<BrowserWindow> {
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
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      void reportStartupFailure(
        '界面加载失败。',
        `地址：${validatedUrl || '未知'}\n错误码：${errorCode}\n原因：${errorDescription}`
      )
    }
  )
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    void reportStartupFailure(
      '安全桥接模块加载失败。',
      `模块：${preloadPath}\n原因：${errorMessage(error)}`
    )
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return
    void reportStartupFailure(
      '界面进程意外退出。',
      `原因：${details.reason}\n退出码：${details.exitCode}`
    )
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })

  try {
    if (development && process.env.ELECTRON_RENDERER_URL) {
      await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
      await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
  } catch (error) {
    await reportStartupFailure('界面无法启动。', errorMessage(error))
  }

  return mainWindow
}

function focusMainWindow(): void {
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', focusMainWindow)

  void app
    .whenReady()
    .then(async () => {
      electronApp.setAppUserModelId('com.albumstudio.desktop')
      installContentSecurityPolicy()

      projects = new ProjectRepository()
      assets = new AssetService(projects)
      pdf = new PdfExporter(projects)
      handleAssetProtocol(projects)

      app.on('browser-window-created', (_event, window) => {
        if (development) optimizer.watchWindowShortcuts(window)
      })

      await createWindow()
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          void createWindow().catch((error) => {
            void reportStartupFailure('无法重新打开应用窗口。', errorMessage(error))
          })
        }
      })
    })
    .catch((error) => {
      void reportStartupFailure('应用初始化失败。', errorMessage(error))
    })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
