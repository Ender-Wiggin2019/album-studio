import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, matchesGlob } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import {
  assertNativeImagePipeline,
  normalizeMacArchitectures,
  packagedResourcesDirectory
} from './package-integrity.mjs'

const temporaryDirectories = []

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'album-package-test-'))
  temporaryDirectories.push(directory)
  return directory
}

async function touch(filePath, content = 'fixture') {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
}

function fixtureModel(payload = Buffer.from('model fixture')) {
  return {
    name: 'fixture.onnx',
    size: payload.byteLength,
    sha256: createHash('sha256').update(payload).digest('hex'),
    payload
  }
}

function peFixture(machine = 0x8664) {
  const fixture = Buffer.alloc(80)
  fixture.write('MZ', 0, 'ascii')
  fixture.writeUInt32LE(64, 0x3c)
  fixture.write('PE\0\0', 64, 'binary')
  fixture.writeUInt16LE(machine, 68)
  return fixture
}

async function createSharedPackageFiles(resourcesDirectory, model) {
  const modules = join(resourcesDirectory, 'app.asar.unpacked', 'node_modules')
  await mkdir(join(modules, 'sharp'), { recursive: true })
  await touch(join(modules, 'onnxruntime-node', 'package.json'))
  await touch(join(modules, 'onnxruntime-node', 'dist', 'index.js'))
  await touch(join(modules, 'onnxruntime-common', 'package.json'))
  await touch(join(modules, 'onnxruntime-common', 'dist', 'cjs', 'index.js'))
  await touch(join(resourcesDirectory, 'models', model.name), model.payload)
  return modules
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('macOS universal 原生依赖完整性', () => {
  it('解析 lipo 输出并去重架构', () => {
    assert.deepEqual(normalizeMacArchitectures('x86_64 arm64 x86_64\n'), ['x64', 'arm64'])
  })

  it('同时验证 arm64 与 x64 的 Sharp、ORT binding 和动态库', async () => {
    const directory = await temporaryDirectory()
    const executable = join(directory, 'mac-universal', '咔宝.app', 'Contents', 'MacOS', '咔宝')
    await touch(executable)
    const model = fixtureModel()
    const modules = await createSharedPackageFiles(
      packagedResourcesDirectory(executable, 'darwin'),
      model
    )

    for (const architecture of ['arm64', 'x64']) {
      await mkdir(join(modules, '@img', `sharp-darwin-${architecture}`), { recursive: true })
      await mkdir(join(modules, '@img', `sharp-libvips-darwin-${architecture}`), {
        recursive: true
      })
      const onnxDirectory = join(
        modules,
        'onnxruntime-node',
        'bin',
        'napi-v6',
        'darwin',
        architecture
      )
      await touch(join(onnxDirectory, 'onnxruntime_binding.node'))
      await touch(join(onnxDirectory, 'libonnxruntime.1.23.2.dylib'))
    }

    const inspected = []
    await assertNativeImagePipeline(executable, {
      platform: 'darwin',
      models: [model],
      inspectArchitectures: async (filePath) => {
        inspected.push(filePath)
        if (filePath === executable) return ['x64', 'arm64']
        return [filePath.includes('/darwin/x64/') ? 'x64' : 'arm64']
      }
    })

    assert.equal(inspected.length, 5)
    assert.equal(
      await readFile(
        join(packagedResourcesDirectory(executable, 'darwin'), 'models', model.name),
        'utf8'
      ),
      model.payload.toString()
    )
  })

  it('拒绝目录名与 binding 实际架构不一致的产物', async () => {
    const directory = await temporaryDirectory()
    const executable = join(directory, 'Test.app', 'Contents', 'MacOS', 'Test')
    await touch(executable)
    const model = fixtureModel()
    const modules = await createSharedPackageFiles(
      packagedResourcesDirectory(executable, 'darwin'),
      model
    )
    await mkdir(join(modules, '@img', 'sharp-darwin-arm64'), { recursive: true })
    await mkdir(join(modules, '@img', 'sharp-libvips-darwin-arm64'), { recursive: true })
    const onnxDirectory = join(modules, 'onnxruntime-node', 'bin', 'napi-v6', 'darwin', 'arm64')
    await touch(join(onnxDirectory, 'onnxruntime_binding.node'))
    await touch(join(onnxDirectory, 'libonnxruntime.1.23.2.dylib'))

    await assert.rejects(
      assertNativeImagePipeline(executable, {
        platform: 'darwin',
        models: [model],
        inspectArchitectures: async (filePath) => (filePath === executable ? ['arm64'] : ['x64'])
      }),
      /原生依赖架构不匹配/
    )
  })
})

describe('Windows x64 原生依赖完整性', () => {
  it('同时要求 binding、onnxruntime.dll 和共享运行时', async () => {
    const directory = await temporaryDirectory()
    const executable = join(directory, 'win-unpacked', 'kabo.exe')
    await touch(executable)
    const model = fixtureModel()
    const modules = await createSharedPackageFiles(
      packagedResourcesDirectory(executable, 'win32'),
      model
    )
    await mkdir(join(modules, '@img', 'sharp-win32-x64'), { recursive: true })
    const onnxDirectory = join(modules, 'onnxruntime-node', 'bin', 'napi-v6', 'win32', 'x64')
    const bindingPath = join(onnxDirectory, 'onnxruntime_binding.node')
    const runtimePath = join(onnxDirectory, 'onnxruntime.dll')
    await touch(bindingPath, peFixture())
    await touch(runtimePath, peFixture())

    await assertNativeImagePipeline(executable, { platform: 'win32', models: [model] })

    await rm(runtimePath)
    await assert.rejects(
      assertNativeImagePipeline(executable, { platform: 'win32', models: [model] }),
      /Windows x64 ONNX Runtime 动态库/
    )

    await touch(runtimePath, peFixture())
    await touch(bindingPath, peFixture(0xaa64))
    await assert.rejects(
      assertNativeImagePipeline(executable, { platform: 'win32', models: [model] }),
      /Windows 原生依赖架构不匹配/
    )
  })
})

describe('electron-builder universal 合并规则', () => {
  it('x64ArchFiles 覆盖 ORT 的两种 macOS 架构', async () => {
    const config = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8')
    const pattern = /^\s*x64ArchFiles:\s*(.+)$/m.exec(config)?.[1]
    assert.ok(pattern)

    const prefix = 'Contents/Resources/app.asar.unpacked/node_modules'
    assert.equal(
      matchesGlob(
        `${prefix}/onnxruntime-node/bin/napi-v6/darwin/arm64/onnxruntime_binding.node`,
        pattern
      ),
      true
    )
    assert.equal(
      matchesGlob(
        `${prefix}/onnxruntime-node/bin/napi-v6/darwin/x64/libonnxruntime.1.23.2.dylib`,
        pattern
      ),
      true
    )
    assert.equal(matchesGlob(`${prefix}/@img/sharp-darwin-arm64/lib/sharp.node`, pattern), true)
  })

  it('显式配置咔宝品牌与同一套图标并覆盖开发态窗口与 Dock', async () => {
    const config = await readFile(new URL('../electron-builder.yml', import.meta.url), 'utf8')
    assert.match(config, /^productName: 咔宝$/m)
    assert.match(config, /^ {2}executableName: kabo$/m)
    assert.match(config, /^ {2}artifactName: kabo-\$\{version\}-setup\.\$\{ext\}$/m)
    assert.match(config, /^ {2}artifactName: kabo-\$\{version\}\.\$\{ext\}$/m)
    assert.match(config, /^win:\n {2}icon: build\/icon\.ico$/m)
    assert.match(config, /^mac:\n {2}icon: build\/icon\.icns$/m)

    const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    assert.match(main, /process\.platform === 'darwin' \? \{\} : \{ icon \}/)
    assert.match(main, /process\.platform === 'darwin'\) app\.dock\?\.setIcon\(icon\)/)

    const runtimeIcon = await readFile(new URL('../resources/icon.png', import.meta.url))
    assert.equal(runtimeIcon.readUInt32BE(16), 512)
    assert.equal(runtimeIcon.readUInt32BE(20), 512)

    const buildIcon = await readFile(new URL('../build/icon.png', import.meta.url))
    assert.equal(buildIcon.readUInt32BE(16), 1024)
    assert.equal(buildIcon.readUInt32BE(20), 1024)

    const windowsIcon = await readFile(new URL('../build/icon.ico', import.meta.url))
    assert.equal(windowsIcon.readUInt16LE(0), 0)
    assert.equal(windowsIcon.readUInt16LE(2), 1)
    assert.equal(windowsIcon.readUInt16LE(4), 7)

    const macIcon = await readFile(new URL('../build/icon.icns', import.meta.url))
    assert.equal(macIcon.toString('ascii', 0, 4), 'icns')
  })
})
