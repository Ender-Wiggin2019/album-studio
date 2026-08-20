import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = dirname(dirname(fileURLToPath(import.meta.url)))

export function createNpmInvocation(args, platform = process.platform, environment = process.env) {
  if (platform === 'win32') {
    return {
      command: environment.ComSpec?.trim() || environment.COMSPEC?.trim() || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', ...args]
    }
  }

  return { command: 'npm', args }
}

function runNpm(args, stdio = 'inherit') {
  return new Promise((resolveRun, reject) => {
    const invocation = createNpmInvocation(args)
    const child = spawn(invocation.command, invocation.args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio,
      windowsHide: false
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal === 'SIGINT' || signal === 'SIGTERM') resolveRun(0)
      else if (signal) reject(new Error(`npm 进程被信号 ${signal} 中止。`))
      else resolveRun(code ?? 1)
    })
  })
}

function assertSupportedNode() {
  const [currentNodeMajor, currentNodeMinor] = process.versions.node
    .split('.')
    .map((part) => Number.parseInt(part, 10))
  const supported = currentNodeMajor > 22 || (currentNodeMajor === 22 && currentNodeMinor >= 12)

  if (!supported) {
    throw new Error(
      `需要 Node.js 22.12.0 或更高版本，当前是 ${process.versions.node}。\n` +
        '请安装 Node.js 22 LTS；如果已经安装 nvm，请先运行 nvm use。'
    )
  }
}

async function ensureDependencies() {
  let npmVersionExitCode
  try {
    npmVersionExitCode = await runNpm(['--version'], 'ignore')
  } catch (error) {
    throw new Error(
      `未找到 npm。请重新安装 Node.js 22 LTS。\n${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (npmVersionExitCode !== 0) throw new Error('npm 无法运行，请重新安装 Node.js 22 LTS。')

  const dependencyTreeComplete =
    existsSync(join(workspaceRoot, 'node_modules')) &&
    (await runNpm(['ls', '--depth=0', '--silent'], 'ignore')) === 0
  if (dependencyTreeComplete) return

  console.log('[咔宝] 首次运行或依赖不完整，正在自动安装…')
  const installCode = await runNpm(['install'])
  if (installCode !== 0) {
    throw new Error(`依赖安装失败（退出码 ${installCode}）。请检查网络后重试。`)
  }
}

async function main() {
  const target = process.argv[2] ?? 'desktop'
  if (target !== 'desktop' && target !== 'web') {
    throw new Error(`未知开发模式：${target}。请使用 desktop 或 web。`)
  }
  assertSupportedNode()
  await ensureDependencies()
  console.log(
    target === 'web'
      ? '[咔宝] 正在打开浏览器调试版，保存代码后会自动刷新…'
      : '[咔宝] 正在启动桌面开发模式，保存代码后会自动刷新…'
  )
  const exitCode = await runNpm(
    target === 'web' ? ['run', 'dev', '--workspace', 'album-studio-web'] : ['run', 'dev']
  )
  if (exitCode !== 0)
    throw new Error(
      `${target === 'web' ? '浏览器' : '桌面'}开发模式启动失败（退出码 ${exitCode}）。`
    )
}

const executedFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (executedFile === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[咔宝] 启动失败：\n${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
