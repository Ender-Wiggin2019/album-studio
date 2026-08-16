import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createNpmInvocation } from '../../../scripts/dev.mjs'
import {
  assertNoRendererStartupErrors,
  captureProcess,
  connectToRenderer,
  reservePort,
  terminateProcessTree,
  waitFor
} from './smoke-runtime.mjs'

const desktopRoot = resolve(import.meta.dirname, '..')
const hmrProbePath = resolve(import.meta.dirname, 'fixtures/dev-hmr-probe.css')
const startupTimeoutMs = 45_000
const hmrTimeoutMs = 15_000
const userData = await mkdtemp(join(tmpdir(), 'album-studio-dev-smoke-'))
const originalProbe = await readFile(hmrProbePath, 'utf8')
const port = await reservePort()
const invocation = createNpmInvocation(['run', 'dev', '--', '--remoteDebuggingPort', String(port)])
let child
let browser

try {
  child = spawn(invocation.command, invocation.args, {
    cwd: desktopRoot,
    detached: true,
    env: {
      ...process.env,
      ALBUM_STUDIO_STARTUP_SMOKE: '1',
      ALBUM_STUDIO_USER_DATA_DIR: userData,
      ELECTRON_ENABLE_LOGGING: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  const processCapture = captureProcess(child)
  const connected = await connectToRenderer(port, startupTimeoutMs, processCapture)
  browser = connected.browser
  const page = connected.page
  const rendererLogs = []
  page.on('console', (message) => rendererLogs.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', (error) => rendererLogs.push(`pageerror: ${error.message}`))

  await page.locator('#root > *').first().waitFor({ state: 'attached', timeout: startupTimeoutMs })
  const readiness = await page.evaluate(() => ({
    rootChildren: document.querySelector('#root')?.childElementCount ?? 0,
    hasPreload: typeof window.albumStudio === 'object',
    timeOrigin: performance.timeOrigin,
    csp: document
      .querySelector('meta[http-equiv="Content-Security-Policy"]')
      ?.getAttribute('content')
  }))
  if (readiness.rootChildren < 1) throw new Error('React 没有挂载到 #root。')
  if (!readiness.hasPreload) throw new Error('window.albumStudio preload API 不可用。')
  if (!readiness.csp?.includes("script-src 'self' 'unsafe-inline'")) {
    throw new Error(`开发态 CSP 未允许 React Refresh preamble：${readiness.csp}`)
  }

  const hmrToken = `hmr-${Date.now()}`
  await writeFile(
    hmrProbePath,
    `:root {\n  --album-studio-dev-hmr-probe: ${hmrToken};\n}\n`,
    'utf8'
  )
  await waitFor(
    '等待 renderer CSS HMR',
    hmrTimeoutMs,
    async () =>
      (await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--album-studio-dev-hmr-probe')
          .trim()
      )) === hmrToken,
    processCapture
  )
  const timeOriginAfterHmr = await page.evaluate(() => performance.timeOrigin)
  if (timeOriginAfterHmr !== readiness.timeOrigin) {
    throw new Error('HMR 触发了 renderer 整页重载。')
  }
  assertNoRendererStartupErrors(processCapture.output, ...rendererLogs)
  console.log(`dev smoke 通过：React、preload、CSP 与 renderer HMR 均正常（CDP ${port}）。`)
} finally {
  await writeFile(hmrProbePath, originalProbe, 'utf8').catch(() => undefined)
  await browser?.close().catch(() => undefined)
  await terminateProcessTree(child)
  await rm(userData, { recursive: true, force: true })
}
