import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { chromium } from '@playwright/test'

const POLL_INTERVAL_MS = 100

export async function reservePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : undefined
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose()))
  )
  if (!port) throw new Error('无法分配调试端口。')
  return port
}

export function captureProcess(child) {
  let output = ''
  let outcome
  const append = (source, chunk) => {
    output += `[${source}] ${chunk.toString()}`
    if (output.length > 2_000_000) output = output.slice(-2_000_000)
  }
  child.stdout?.on('data', (chunk) => append('stdout', chunk))
  child.stderr?.on('data', (chunk) => append('stderr', chunk))
  const exited = new Promise((resolveExit) => {
    child.once('error', (error) => {
      outcome = { error }
      resolveExit(outcome)
    })
    child.once('exit', (code, signal) => {
      outcome = { code, signal }
      resolveExit(outcome)
    })
  })
  return {
    exited,
    get outcome() {
      return outcome
    },
    get output() {
      return output
    }
  }
}

export async function waitFor(description, timeoutMs, probe, processCapture) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (processCapture?.outcome) {
      throw new Error(
        `${description}前进程已退出：${JSON.stringify(processCapture.outcome)}\n${processCapture.output}`
      )
    }
    try {
      const value = await probe()
      if (value !== undefined && value !== false && value !== null) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, POLL_INTERVAL_MS))
  }
  throw new Error(
    `${description}超时。${lastError ? ` 最后错误：${lastError instanceof Error ? lastError.message : String(lastError)}` : ''}\n${processCapture?.output ?? ''}`
  )
}

export async function connectToRenderer(port, timeoutMs, processCapture) {
  const deadline = Date.now() + timeoutMs
  const remaining = () => Math.max(1, deadline - Date.now())
  const endpoint = `http://127.0.0.1:${port}`
  const browser = await waitFor(
    '连接 Electron renderer',
    remaining(),
    async () => {
      try {
        return await chromium.connectOverCDP(endpoint, { timeout: 1_000 })
      } catch {
        return undefined
      }
    },
    processCapture
  )
  try {
    const page = await waitFor(
      '等待 Electron renderer 页面',
      remaining(),
      () =>
        browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => !candidate.url().startsWith('devtools://')),
      processCapture
    )
    return { browser, page }
  } catch (error) {
    await browser.close().catch(() => undefined)
    throw error
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return Promise.race([
    new Promise((resolveExit) => child.once('exit', () => resolveExit(true))),
    new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(false), timeoutMs))
  ])
}

export async function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    })
    await Promise.race([
      new Promise((resolveExit) => killer.once('exit', resolveExit)),
      new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000))
    ])
    await waitForExit(child, 2_000)
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  if (await waitForExit(child, 5_000)) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
  await waitForExit(child, 2_000)
}

export function assertNoRendererStartupErrors(...logs) {
  const combined = logs.join('\n')
  const forbidden = [
    /@vitejs\/plugin-react can't detect preamble/i,
    /Refused to .*Content Security Policy/i,
    /Uncaught \(in promise\).*preamble/i
  ]
  const match = forbidden.find((pattern) => pattern.test(combined))
  if (match) throw new Error(`检测到 renderer 启动错误 ${match}:\n${combined}`)
}
