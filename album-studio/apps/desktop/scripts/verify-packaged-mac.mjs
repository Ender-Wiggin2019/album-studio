import { spawn } from 'node:child_process'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.platform !== 'darwin') {
  console.log('跳过：macOS 应用包只能在 macOS 上启动验证。')
  process.exit(0)
}

const distRoot = resolve(import.meta.dirname, '..', 'dist')
const productName = '电子相册工作室.app'
const outputDirectories = (await readdir(distRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('mac'))
  .map((entry) => entry.name)
  .sort((left, right) => right.localeCompare(left))
let appDirectory
for (const directory of outputDirectories) {
  const entries = await readdir(join(distRoot, directory))
  if (entries.includes(productName)) {
    appDirectory = join(distRoot, directory, productName)
    break
  }
}

if (!appDirectory) throw new Error('没有找到已解包的 macOS 应用，请先运行 npm run package:unpack。')

const executable = join(appDirectory, 'Contents', 'MacOS', '电子相册工作室')
const userData = await mkdtemp(join(tmpdir(), 'album-studio-package-smoke-'))
const child = spawn(executable, [`--user-data-dir=${userData}`], {
  stdio: ['ignore', 'pipe', 'pipe']
})
let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => (stdout += chunk.toString()))
child.stderr.on('data', (chunk) => (stderr += chunk.toString()))

const earlyExit = await Promise.race([
  new Promise((resolveExit) => child.once('exit', (code, signal) => resolveExit({ code, signal }))),
  new Promise((resolveTimeout) => setTimeout(() => resolveTimeout(null), 3_000))
])

if (earlyExit) {
  await rm(userData, { recursive: true, force: true })
  throw new Error(
    `应用启动后提前退出：${JSON.stringify(earlyExit)}\n${stdout.trim()}\n${stderr.trim()}`
  )
}

child.kill('SIGTERM')
await new Promise((resolveExit) => child.once('exit', resolveExit))
await rm(userData, { recursive: true, force: true })
console.log(`应用包启动验证通过：${appDirectory}`)
