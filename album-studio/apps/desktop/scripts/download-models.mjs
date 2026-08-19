// 下载消除人物功能所需的 ONNX 模型到 resources/models/（默认走 hf-mirror，失败回退 huggingface.co）
import { createWriteStream, mkdirSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const targetDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'models')
mkdirSync(targetDir, { recursive: true })

const FILES = [
  {
    name: 'lama_512_int8.onnx',
    hosts: [
      'https://hf-mirror.com/g-ronimo/lama/resolve/main/lama_512_int8.onnx',
      'https://huggingface.co/g-ronimo/lama/resolve/main/lama_512_int8.onnx'
    ]
  },
  {
    name: 'selfie_segmentation.onnx',
    hosts: [
      'https://hf-mirror.com/onnx-community/mediapipe_selfie_segmentation-web/resolve/main/onnx/model.onnx',
      'https://huggingface.co/onnx-community/mediapipe_selfie_segmentation-web/resolve/main/onnx/model.onnx'
    ]
  }
]

async function download(url, targetPath) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(targetPath))
}

for (const file of FILES) {
  const targetPath = join(targetDir, file.name)
  let lastError
  for (const url of file.hosts) {
    try {
      await download(url, targetPath)
      const { statSync } = await import('node:fs')
      console.log(
        `已下载 ${file.name} (${(statSync(targetPath).size / 1024 / 1024).toFixed(1)} MB)`
      )
      lastError = null
      break
    } catch (error) {
      lastError = error
      console.warn(`下载失败 ${url}: ${error.message}`)
    }
  }
  if (lastError) {
    console.error(`模型下载失败：${file.name}`)
    process.exitCode = 1
  }
}
