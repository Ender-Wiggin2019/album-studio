import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const MODEL_FILES = Object.freeze([
  {
    name: 'lama_512_int8.onnx',
    size: 62_074_990,
    sha256: 'cab19978adc306622fe37ef60d4a52103b99c98141d499c2a2366a7ed1255dbe',
    hosts: [
      'https://hf-mirror.com/g-ronimo/lama/resolve/418036c6b541e526cdbb0bead1ec3a87dabede53/lama_512_int8.onnx',
      'https://huggingface.co/g-ronimo/lama/resolve/418036c6b541e526cdbb0bead1ec3a87dabede53/lama_512_int8.onnx'
    ]
  },
  {
    name: 'selfie_segmentation.onnx',
    size: 465_220,
    sha256: '44f328e21a3840b7ddb177c8efe50177248d15d25b4905479b06e50d2470584e',
    hosts: [
      'https://hf-mirror.com/onnx-community/mediapipe_selfie_segmentation-web/resolve/441d63532b2f0dbb50118a097b80b659b4460c60/onnx/model.onnx',
      'https://huggingface.co/onnx-community/mediapipe_selfie_segmentation-web/resolve/441d63532b2f0dbb50118a097b80b659b4460c60/onnx/model.onnx'
    ]
  }
])

export const MODEL_TARGET_DIRECTORY = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'models'
)

export async function sha256File(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

export async function verifyModelFile(filePath, expected) {
  try {
    const fileStat = await stat(filePath)
    if (fileStat.size !== expected.size) return false
    return (await sha256File(filePath)) === expected.sha256
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

export async function downloadModelFile(
  model,
  { targetDirectory = MODEL_TARGET_DIRECTORY, fetchImpl = fetch, logger = console } = {}
) {
  await mkdir(targetDirectory, { recursive: true })
  const targetPath = join(targetDirectory, model.name)
  if (await verifyModelFile(targetPath, model)) {
    logger.log(`已验证 ${model.name}，无需重复下载。`)
    return targetPath
  }

  let lastError
  for (const url of model.hosts) {
    const temporaryPath = join(
      targetDirectory,
      `.${model.name}.${process.pid}.${randomUUID()}.download`
    )
    try {
      const response = await fetchImpl(url, { redirect: 'follow' })
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(temporaryPath, { flags: 'wx' })
      )
      if (!(await verifyModelFile(temporaryPath, model))) {
        throw new Error('文件大小或 SHA-256 校验失败')
      }
      await rename(temporaryPath, targetPath)
      logger.log(`已下载并验证 ${model.name} (${(model.size / 1024 / 1024).toFixed(1)} MB)`)
      return targetPath
    } catch (error) {
      lastError = error
      await rm(temporaryPath, { force: true })
      logger.warn(`下载失败 ${url}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  throw new Error(
    `模型下载失败：${model.name}${lastError instanceof Error ? `（${lastError.message}）` : ''}`
  )
}

export async function downloadModels(options) {
  for (const model of MODEL_FILES) await downloadModelFile(model, options)
}

const isDirectRun =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url

if (isDirectRun) {
  downloadModels().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
