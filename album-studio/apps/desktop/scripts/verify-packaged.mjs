import { spawn } from 'node:child_process'
import { access, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  assertNoRendererStartupErrors,
  captureProcess,
  connectToRenderer,
  reservePort,
  terminateProcessTree
} from './smoke-runtime.mjs'
import { assertNativeImagePipeline, packagedResourcesDirectory } from './package-integrity.mjs'

const totalTimeoutMs = 30_000
const maxAppAsarBytes = 64 * 1024 * 1024
const distRoot = resolve(import.meta.dirname, '..', 'dist')
const userData = await mkdtemp(join(tmpdir(), 'album-studio-package-smoke-'))
let child
let browser
let processCapture

async function findPackagedExecutable() {
  if (process.env.ALBUM_STUDIO_PACKAGED_EXECUTABLE) {
    const executable = resolve(process.env.ALBUM_STUDIO_PACKAGED_EXECUTABLE)
    await access(executable)
    return executable
  }

  if (process.platform === 'win32') {
    const executable = join(distRoot, 'win-unpacked', 'album-studio.exe')
    await access(executable)
    return executable
  }

  if (process.platform === 'darwin') {
    const productName = '电子相册工作室.app'
    const outputDirectories = (await readdir(distRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('mac'))
      .map((entry) => entry.name)
    const candidates = []
    for (const directory of outputDirectories) {
      const executable = join(
        distRoot,
        directory,
        productName,
        'Contents',
        'MacOS',
        '电子相册工作室'
      )
      try {
        const appAsar = join(distRoot, directory, productName, 'Contents', 'Resources', 'app.asar')
        candidates.push({ executable, modifiedAt: (await stat(appAsar)).mtimeMs })
      } catch {
        // Try the next electron-builder output directory.
      }
    }
    candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)
    if (candidates[0]) return candidates[0].executable
  }

  throw new Error(`当前平台没有找到可启动的解包产物：${process.platform}`)
}

async function assertLeanAppAsar(executable) {
  const appAsarPath = join(packagedResourcesDirectory(executable), 'app.asar')
  const appAsarBytes = (await stat(appAsarPath)).size
  if (appAsarBytes > maxAppAsarBytes) {
    throw new Error(
      `app.asar 体积 ${formatMiB(appAsarBytes)} MiB 超过 ${formatMiB(maxAppAsarBytes)} MiB 门禁：${appAsarPath}`
    )
  }
  return appAsarBytes
}

function formatMiB(bytes) {
  return (bytes / 1024 / 1024).toFixed(2)
}

async function verifyPackagedRenderer() {
  const executable = await findPackagedExecutable()
  const appAsarBytes = await assertLeanAppAsar(executable)
  await assertNativeImagePipeline(executable)
  const port = await reservePort()
  child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
    detached: true,
    env: {
      ...process.env,
      ALBUM_STUDIO_STARTUP_SMOKE: '1',
      ELECTRON_ENABLE_LOGGING: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  processCapture = captureProcess(child)
  const connected = await connectToRenderer(port, totalTimeoutMs, processCapture)
  browser = connected.browser
  const page = connected.page
  const rendererLogs = []
  page.on('console', (message) => rendererLogs.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', (error) => rendererLogs.push(`pageerror: ${error.message}`))

  await page.locator('#root > *').first().waitFor({ state: 'attached', timeout: totalTimeoutMs })
  const readiness = await page.evaluate(() => ({
    title: document.title,
    rootChildren: document.querySelector('#root')?.childElementCount ?? 0,
    hasPreload: typeof window.albumStudio === 'object',
    csp: document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content')
  }))
  if (readiness.title !== '电子相册工作室') throw new Error(`应用标题异常：${readiness.title}`)
  if (readiness.rootChildren < 1) throw new Error('打包应用的 React 没有挂载到 #root。')
  if (!readiness.hasPreload) throw new Error('打包应用的 window.albumStudio preload API 不可用。')
  if (!readiness.csp?.includes("script-src 'self'")) {
    throw new Error(`打包应用缺少 production script CSP：${readiness.csp}`)
  }
  if (readiness.csp.includes("script-src 'self' 'unsafe-inline'")) {
    throw new Error(`打包应用错误地允许了 inline script：${readiness.csp}`)
  }
  assertNoRendererStartupErrors(processCapture.output, ...rendererLogs)
  console.log(`package smoke 通过：${executable}（app.asar ${formatMiB(appAsarBytes)} MiB）`)
}

let timeout
try {
  await Promise.race([
    verifyPackagedRenderer(),
    new Promise((_, reject) => {
      timeout = setTimeout(
        () =>
          reject(
            new Error(
              `package smoke 总超时（${totalTimeoutMs}ms）。\n${processCapture?.output ?? ''}`
            )
          ),
        totalTimeoutMs
      )
    })
  ])
} finally {
  clearTimeout(timeout)
  await browser?.close().catch(() => undefined)
  await terminateProcessTree(child)
  await rm(userData, { recursive: true, force: true })
}
