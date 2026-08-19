import { execFile } from 'node:child_process'
import { access, open, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { MODEL_FILES, verifyModelFile } from './download-models.mjs'

const execFileAsync = promisify(execFile)

export function packagedResourcesDirectory(executable, platform = process.platform) {
  return platform === 'darwin'
    ? resolve(dirname(executable), '..', 'Resources')
    : join(dirname(executable), 'resources')
}

export function normalizeMacArchitectures(output) {
  return [
    ...new Set(
      String(output)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((architecture) => (architecture === 'x86_64' ? 'x64' : architecture))
    )
  ]
}

export async function inspectMacBinaryArchitectures(filePath) {
  const { stdout } = await execFileAsync('lipo', ['-archs', filePath])
  const architectures = normalizeMacArchitectures(stdout)
  if (architectures.length === 0) {
    throw new Error(`无法识别 macOS 二进制架构：${filePath}`)
  }
  return architectures
}

export async function inspectWindowsPeArchitecture(filePath) {
  const file = await open(filePath, 'r')
  try {
    const dosHeader = Buffer.alloc(64)
    const dosRead = await file.read(dosHeader, 0, dosHeader.length, 0)
    if (dosRead.bytesRead !== dosHeader.length || dosHeader.toString('ascii', 0, 2) !== 'MZ') {
      throw new Error(`无效的 Windows PE 文件：${filePath}`)
    }
    const peOffset = dosHeader.readUInt32LE(0x3c)
    const peHeader = Buffer.alloc(6)
    const peRead = await file.read(peHeader, 0, peHeader.length, peOffset)
    if (peRead.bytesRead !== peHeader.length || peHeader.toString('binary', 0, 4) !== 'PE\0\0') {
      throw new Error(`无效的 Windows PE 文件：${filePath}`)
    }
    const machine = peHeader.readUInt16LE(4)
    if (machine === 0x8664) return 'x64'
    if (machine === 0xaa64) return 'arm64'
    if (machine === 0x014c) return 'x86'
    return `0x${machine.toString(16)}`
  } finally {
    await file.close()
  }
}

async function requirePath(filePath, message) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`${message}：${filePath}`)
  }
}

async function requireMacArchitecture(filePath, architecture, inspectArchitectures) {
  const architectures = await inspectArchitectures(filePath)
  if (!architectures.includes(architecture)) {
    throw new Error(
      `macOS 原生依赖架构不匹配：${filePath}（期望 ${architecture}，实际 ${architectures.join(', ') || '未知'}）`
    )
  }
}

export async function assertNativeImagePipeline(
  executable,
  {
    platform = process.platform,
    architecture = process.arch,
    models = MODEL_FILES,
    inspectArchitectures = inspectMacBinaryArchitectures,
    inspectWindowsArchitecture = inspectWindowsPeArchitecture
  } = {}
) {
  const resourcesDirectory = packagedResourcesDirectory(executable, platform)
  const unpackedModules = join(resourcesDirectory, 'app.asar.unpacked', 'node_modules')
  const expectedPackages = ['sharp']

  for (const runtimeEntry of [
    join(unpackedModules, 'onnxruntime-node', 'package.json'),
    join(unpackedModules, 'onnxruntime-node', 'dist', 'index.js'),
    join(unpackedModules, 'onnxruntime-common', 'package.json'),
    join(unpackedModules, 'onnxruntime-common', 'dist', 'cjs', 'index.js')
  ]) {
    await requirePath(runtimeEntry, '打包产物缺少 ONNX Runtime JavaScript 入口')
  }

  if (platform === 'win32') {
    expectedPackages.push('@img/sharp-win32-x64')
    const bindingPath = join(
      unpackedModules,
      'onnxruntime-node',
      'bin',
      'napi-v6',
      'win32',
      'x64',
      'onnxruntime_binding.node'
    )
    const runtimePath = join(
      unpackedModules,
      'onnxruntime-node',
      'bin',
      'napi-v6',
      'win32',
      'x64',
      'onnxruntime.dll'
    )
    await requirePath(bindingPath, '打包产物缺少 Windows x64 ONNX Runtime binding')
    await requirePath(runtimePath, '打包产物缺少 Windows x64 ONNX Runtime 动态库')
    for (const nativePath of [bindingPath, runtimePath]) {
      const nativeArchitecture = await inspectWindowsArchitecture(nativePath)
      if (nativeArchitecture !== 'x64') {
        throw new Error(
          `Windows 原生依赖架构不匹配：${nativePath}（期望 x64，实际 ${nativeArchitecture}）`
        )
      }
    }
  } else if (platform === 'darwin') {
    const architectures = await inspectArchitectures(executable)
    for (const macArchitecture of architectures) {
      if (macArchitecture !== 'arm64' && macArchitecture !== 'x64') {
        throw new Error(`打包产物包含不支持的 macOS 架构：${macArchitecture}`)
      }
      expectedPackages.push(`@img/sharp-darwin-${macArchitecture}`)
      expectedPackages.push(`@img/sharp-libvips-darwin-${macArchitecture}`)
      const onnxDirectory = join(
        unpackedModules,
        'onnxruntime-node',
        'bin',
        'napi-v6',
        'darwin',
        macArchitecture
      )
      const bindingPath = join(onnxDirectory, 'onnxruntime_binding.node')
      await requirePath(bindingPath, `打包产物缺少 macOS ${macArchitecture} ONNX Runtime binding`)
      await requireMacArchitecture(bindingPath, macArchitecture, inspectArchitectures)

      const runtimeLibraries = (await readdir(onnxDirectory)).filter((fileName) =>
        /^libonnxruntime\..+\.dylib$/.test(fileName)
      )
      if (runtimeLibraries.length === 0) {
        throw new Error(`打包产物缺少 ONNX Runtime 动态库：${onnxDirectory}`)
      }
      for (const libraryName of runtimeLibraries) {
        await requireMacArchitecture(
          join(onnxDirectory, libraryName),
          macArchitecture,
          inspectArchitectures
        )
      }
    }
  } else {
    expectedPackages.push(`@img/sharp-${platform}-${architecture}`)
  }

  for (const packageName of expectedPackages) {
    await requirePath(join(unpackedModules, ...packageName.split('/')), '打包产物缺少原生图片依赖')
  }

  for (const model of models) {
    const modelPath = join(resourcesDirectory, 'models', model.name)
    if (!(await verifyModelFile(modelPath, model))) {
      throw new Error(`打包产物中的模型缺失或校验失败：${modelPath}`)
    }
  }
}
