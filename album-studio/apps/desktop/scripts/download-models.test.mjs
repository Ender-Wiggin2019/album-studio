import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { downloadModelFile, verifyModelFile } from './download-models.mjs'

const temporaryDirectories = []
const silentLogger = { log: () => undefined, warn: () => undefined }

function testModel(payload, hosts = ['https://models.example/test.onnx']) {
  return {
    name: 'test.onnx',
    size: payload.byteLength,
    sha256: createHash('sha256').update(payload).digest('hex'),
    hosts
  }
}

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'album-model-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('模型下载完整性', () => {
  it('命中尺寸和摘要都正确的文件时不发起网络请求', async () => {
    const directory = await temporaryDirectory()
    const payload = Buffer.from('verified model')
    const model = testModel(payload)
    await writeFile(join(directory, model.name), payload)
    let fetchCalls = 0
    const fetchImpl = async () => {
      fetchCalls += 1
      return new Response('unexpected')
    }

    await downloadModelFile(model, { targetDirectory: directory, fetchImpl, logger: silentLogger })

    assert.equal(fetchCalls, 0)
    assert.equal(await verifyModelFile(join(directory, model.name), model), true)
  })

  it('下载内容摘要错误时保留已有文件并清理临时文件', async () => {
    const directory = await temporaryDirectory()
    const previous = Buffer.from('previous model')
    const expected = Buffer.from('expected model')
    const model = testModel(expected)
    const targetPath = join(directory, model.name)
    await writeFile(targetPath, previous)

    await assert.rejects(
      downloadModelFile(model, {
        targetDirectory: directory,
        fetchImpl: async () => new Response('corrupt model'),
        logger: silentLogger
      }),
      /模型下载失败/
    )

    assert.deepEqual(await readFile(targetPath), previous)
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.endsWith('.download')),
      []
    )
  })

  it('只有校验通过后才原子发布最终文件', async () => {
    const directory = await temporaryDirectory()
    const payload = Buffer.from('new verified model')
    const model = testModel(payload)

    await downloadModelFile(model, {
      targetDirectory: directory,
      fetchImpl: async () => new Response(payload),
      logger: silentLogger
    })

    assert.deepEqual(await readFile(join(directory, model.name)), payload)
    assert.equal(await verifyModelFile(join(directory, model.name), model), true)
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.endsWith('.download')),
      []
    )
  })

  it('镜像内容错误时回退官方源，并且只用校验通过的内容替换旧文件', async () => {
    const directory = await temporaryDirectory()
    const payload = Buffer.from('verified fallback model')
    const model = testModel(payload, [
      'https://mirror.example/test.onnx',
      'https://origin.example/test.onnx'
    ])
    await writeFile(join(directory, model.name), 'stale model')
    const requestedUrls = []

    await downloadModelFile(model, {
      targetDirectory: directory,
      fetchImpl: async (url) => {
        requestedUrls.push(url)
        return new Response(url.includes('mirror') ? 'corrupt model' : payload)
      },
      logger: silentLogger
    })

    assert.deepEqual(requestedUrls, model.hosts)
    assert.deepEqual(await readFile(join(directory, model.name)), payload)
    assert.deepEqual(
      (await readdir(directory)).filter((name) => name.endsWith('.download')),
      []
    )
  })
})
