import { IMAGE_PIPELINE_VERSION, pageSpecSizeAtDpi, type PageSpec } from '@album-studio/common'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, realpath, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, posix, resolve, sep } from 'node:path'
import sharp from 'sharp'

// Windows 上 libvips 会缓存已打开文件的句柄：inspectImage 读取临时文件后，
// publishTemporaryFile 立即 rename/unlink 该临时文件会报 EBUSY（句柄被缓存保持）。
// 全局禁用文件句柄缓存，让每次读取后句柄立即释放（与测试环境一致，见 image-store.test.ts）。
sharp.cache({ files: 0 })

export const MAX_INPUT_PIXELS = 80_000_000

const PREVIEW_TARGET = { width: 1600, height: 1200 } as const
const THUMBNAIL_TARGET = { width: 480, height: 360 } as const
const PRINT_DPI = 300

export type SupportedImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'

export type StoredImageIdentity = {
  contentHash: string
  mimeType: SupportedImageMimeType
  width: number
  height: number
}

export type ImageVariantRequest =
  | { variant: 'original' }
  | { variant: 'thumbnail' }
  | { variant: 'preview' }
  | {
      variant: 'print'
      pageSpec: PageSpec
      usage?: { widthFraction: number; heightFraction: number }
    }
  | { variant: 'erased'; usage: { eraseKey: string } }

export type StoredImage = {
  contentHash: string
  mimeType: SupportedImageMimeType
  byteSize: number
  width: number
  height: number
  duplicate: boolean
}

type ImageStoreOptions = {
  maxInputPixels?: number
  derivativeConcurrency?: number
}

const EXTENSION_BY_MIME: Record<SupportedImageMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif'
}

const MIME_BY_SHARP_FORMAT = new Map<string, SupportedImageMimeType>([
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp']
])

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function assertContentHash(contentHash: string): void {
  if (!/^[a-f0-9]{64}$/.test(contentHash)) throw new Error('素材内容指纹无效。')
}

function assertMimeType(mimeType: string): asserts mimeType is SupportedImageMimeType {
  if (!(mimeType in EXTENSION_BY_MIME)) throw new Error('素材图片格式无效。')
}

function assertEraseKey(eraseKey: string): void {
  if (!/^[0-9a-z]{4,64}$/.test(eraseKey)) throw new Error('消除结果键无效。')
}

function toFileSystemPath(root: string, relativePath: string): string {
  return resolve(root, ...relativePath.split('/'))
}

export function isPathInside(parent: string, child: string): boolean {
  const normalizedParent = resolve(parent)
  const normalizedChild = resolve(child)
  return (
    normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}${sep}`)
  )
}

export function originalRelativePath(
  asset: Pick<StoredImageIdentity, 'contentHash' | 'mimeType'>
): string {
  assertContentHash(asset.contentHash)
  assertMimeType(asset.mimeType)
  return posix.join(
    'assets',
    'original',
    `${asset.contentHash}${EXTENSION_BY_MIME[asset.mimeType]}`
  )
}

function usageFraction(value: number | undefined): number {
  const resolved = value ?? 1
  if (!Number.isFinite(resolved) || resolved <= 0 || resolved > 1) {
    throw new Error('打印元素尺寸必须是大于 0 且不超过 1 的页面比例。')
  }
  return resolved
}

function printPageTarget(pageSpec: PageSpec): { width: number; height: number } {
  return pageSpecSizeAtDpi(pageSpec, PRINT_DPI)
}

export function printTargetForUsage(
  pageSpec: PageSpec,
  usage?: { widthFraction: number; heightFraction: number }
): {
  width: number
  height: number
} {
  const pageTarget = printPageTarget(pageSpec)
  return {
    width: Math.max(1, Math.round(pageTarget.width * usageFraction(usage?.widthFraction))),
    height: Math.max(1, Math.round(pageTarget.height * usageFraction(usage?.heightFraction)))
  }
}

function derivativeDescriptor(request: Exclude<ImageVariantRequest, { variant: 'original' }>): {
  name: string
  target: { width: number; height: number }
} {
  if (request.variant === 'erased') {
    return { name: `erased-${request.usage.eraseKey}`, target: { width: 0, height: 0 } }
  }
  const target =
    request.variant === 'thumbnail'
      ? THUMBNAIL_TARGET
      : request.variant === 'preview'
        ? PREVIEW_TARGET
        : printTargetForUsage(request.pageSpec, request.usage)
  return {
    name: `${request.variant}-${target.width}x${target.height}`,
    target
  }
}

export function derivativeRelativePath(
  asset: Pick<StoredImageIdentity, 'contentHash'>,
  request: Exclude<ImageVariantRequest, { variant: 'original' }>
): string {
  assertContentHash(asset.contentHash)
  return posix.join(
    'assets',
    'cache',
    IMAGE_PIPELINE_VERSION,
    asset.contentHash,
    `${derivativeDescriptor(request).name}.webp`
  )
}

async function ensureSafeDirectory(root: string, segments: string[]): Promise<string> {
  const canonicalRoot = await realpath(root)
  let current = canonicalRoot
  for (const segment of segments) {
    const candidate = join(current, segment)
    try {
      await mkdir(candidate)
    } catch (error) {
      if (!isNodeError(error, 'EEXIST')) throw error
    }
    const info = await lstat(candidate)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error('项目图片目录不是安全的文件夹。')
    }
    current = await realpath(candidate)
    if (!isPathInside(canonicalRoot, current)) throw new Error('项目图片目录越过项目边界。')
  }
  return current
}

async function existingRegularFile(path: string): Promise<boolean> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('素材路径不是安全的普通文件。')
    if (info.size < 1) {
      await unlink(path)
      return false
    }
    return true
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) return false
    throw error
  }
}

async function syncDirectory(path: string): Promise<void> {
  if (process.platform === 'win32') return
  const directory = await open(path, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

async function publishTemporaryFile(temporaryPath: string, finalPath: string): Promise<boolean> {
  if (await existingRegularFile(finalPath)) {
    await unlink(temporaryPath)
    return true
  }
  try {
    await rename(temporaryPath, finalPath)
    await syncDirectory(dirname(finalPath))
    return false
  } catch (error) {
    if (isNodeError(error, 'EEXIST') && (await existingRegularFile(finalPath))) {
      await unlink(temporaryPath).catch(() => undefined)
      return true
    }
    throw error
  }
}

async function copyAndHash(
  sourcePath: string,
  temporaryPath: string
): Promise<{
  contentHash: string
  byteSize: number
}> {
  const source = await open(sourcePath, 'r')
  const hash = createHash('sha256')
  let byteSize = 0
  try {
    const destination = await open(temporaryPath, 'wx')
    try {
      const sourceInfo = await source.stat()
      if (!sourceInfo.isFile()) throw new Error('不是普通文件')
      for await (const part of source.createReadStream({ autoClose: false })) {
        const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part)
        hash.update(chunk)
        byteSize += chunk.byteLength
        let offset = 0
        while (offset < chunk.byteLength) {
          const { bytesWritten } = await destination.write(
            chunk,
            offset,
            chunk.byteLength - offset,
            null
          )
          if (bytesWritten < 1) throw new Error('写入原图时未取得进展。')
          offset += bytesWritten
        }
      }
      await destination.sync()
    } finally {
      await destination.close().catch(() => undefined)
    }
  } finally {
    await source.close().catch(() => undefined)
  }
  return { contentHash: hash.digest('hex'), byteSize }
}

async function inspectImage(
  path: string,
  maxInputPixels: number
): Promise<{
  mimeType: SupportedImageMimeType
  width: number
  height: number
}> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  try {
    metadata = await sharp(path, {
      failOn: 'error',
      limitInputPixels: maxInputPixels,
      sequentialRead: true
    }).metadata()
  } catch (error) {
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new Error(`图片像素总量超过 ${maxInputPixels.toLocaleString('en-US')} 上限。`)
    }
    throw new Error('图片内容无法安全解码。', { cause: error })
  }

  const mimeType =
    metadata.format === 'heif' && metadata.compression === 'av1'
      ? 'image/avif'
      : metadata.format
        ? MIME_BY_SHARP_FORMAT.get(metadata.format)
        : undefined
  if (!mimeType) throw new Error('仅支持 JPEG、PNG、WebP 和 AVIF 图片。')
  const width = metadata.autoOrient.width
  const height = metadata.autoOrient.height
  if (!width || !height || width < 1 || height < 1) throw new Error('图片尺寸无效。')
  if (width * height > maxInputPixels) {
    throw new Error(`图片像素总量超过 ${maxInputPixels.toLocaleString('en-US')} 上限。`)
  }
  return { mimeType, width, height }
}

function derivativeSize(
  asset: Pick<StoredImageIdentity, 'width' | 'height'>,
  request: Exclude<ImageVariantRequest, { variant: 'original' }>
): { width: number; height: number } {
  if (request.variant === 'erased') {
    return { width: Math.max(1, asset.width), height: Math.max(1, asset.height) }
  }
  const descriptor = derivativeDescriptor(request)
  const width = Math.max(1, asset.width)
  const height = Math.max(1, asset.height)
  const requestedScale =
    request.variant === 'thumbnail' || request.variant === 'preview'
      ? Math.min(descriptor.target.width / width, descriptor.target.height / height)
      : Math.max(descriptor.target.width / width, descriptor.target.height / height)
  const maximumPrintTarget = request.variant === 'print' ? printPageTarget(request.pageSpec) : null
  const pixelLimitScale = maximumPrintTarget
    ? Math.sqrt((maximumPrintTarget.width * maximumPrintTarget.height) / (width * height))
    : 1
  const scale = Math.min(1, requestedScale, pixelLimitScale)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  }
}

class AsyncLimiter {
  private active = 0
  private readonly waiting: Array<() => void> = []

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('并发上限必须是正整数。')
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.active -= 1
      this.waiting.shift()?.()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.waiting.push(() => {
        this.active += 1
        resolve()
      })
    })
  }
}

export class ImageStore {
  private readonly maxInputPixels: number
  private readonly limiter: AsyncLimiter
  private readonly inFlight = new Map<string, Promise<string>>()

  constructor(options: ImageStoreOptions = {}) {
    this.maxInputPixels = options.maxInputPixels ?? MAX_INPUT_PIXELS
    if (!Number.isInteger(this.maxInputPixels) || this.maxInputPixels < 1) {
      throw new Error('图片像素上限必须是正整数。')
    }
    this.limiter = new AsyncLimiter(options.derivativeConcurrency ?? 2)
  }

  async importFile(
    projectRoot: string,
    sourcePath: string,
    expected?: { contentHash?: string; mimeType?: SupportedImageMimeType }
  ): Promise<StoredImage> {
    const originalDirectory = await ensureSafeDirectory(projectRoot, ['assets', 'original'])
    const temporaryPath = join(originalDirectory, `.import-${process.pid}-${randomUUID()}.tmp`)
    try {
      const copied = await copyAndHash(sourcePath, temporaryPath)
      const inspected = await inspectImage(temporaryPath, this.maxInputPixels)
      if (expected?.contentHash && copied.contentHash !== expected.contentHash) {
        throw new Error('所选文件不是原来的照片（内容指纹不一致）。')
      }
      if (expected?.mimeType && inspected.mimeType !== expected.mimeType) {
        throw new Error('文件内容与声明的图片格式不一致。')
      }
      const relativePath = originalRelativePath({
        contentHash: copied.contentHash,
        mimeType: inspected.mimeType
      })
      const finalPath = toFileSystemPath(projectRoot, relativePath)
      if (!isPathInside(projectRoot, finalPath)) throw new Error('素材路径越过项目边界。')
      const duplicate = await publishTemporaryFile(temporaryPath, finalPath)
      return { ...copied, ...inspected, duplicate }
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
  }

  async resolve(
    projectRoot: string,
    asset: StoredImageIdentity,
    request: ImageVariantRequest
  ): Promise<string> {
    const canonicalRoot = await realpath(projectRoot)
    const originalPath = toFileSystemPath(canonicalRoot, originalRelativePath(asset))
    const resolvedOriginal = await realpath(originalPath)
    if (!isPathInside(canonicalRoot, resolvedOriginal)) {
      throw new Error('素材链接越过项目边界。')
    }
    const originalInfo = await lstat(originalPath)
    if (!originalInfo.isFile() || originalInfo.isSymbolicLink()) {
      throw new Error('素材路径不是安全的普通文件。')
    }
    if (request.variant === 'original') return resolvedOriginal

    const relativePath = derivativeRelativePath(asset, request)
    const finalPath = toFileSystemPath(canonicalRoot, relativePath)

    // 消除结果由推理服务生成，这里只做只读查找；缺失时抛错（协议层转 404）。
    if (request.variant === 'erased') {
      if (await existingRegularFile(finalPath)) {
        const cached = await realpath(finalPath)
        if (!isPathInside(canonicalRoot, cached)) throw new Error('素材缓存越过项目边界。')
        return cached
      }
      throw new Error('消除结果缓存缺失，请重新应用消除。')
    }

    const existing = this.inFlight.get(finalPath)
    if (existing) return existing

    const operation = this.limiter.run(async () => {
      const cacheDirectory = await ensureSafeDirectory(canonicalRoot, [
        'assets',
        'cache',
        IMAGE_PIPELINE_VERSION,
        asset.contentHash
      ])
      if (await existingRegularFile(finalPath)) {
        const cached = await realpath(finalPath)
        if (!isPathInside(canonicalRoot, cached)) throw new Error('素材缓存越过项目边界。')
        return cached
      }

      const temporaryPath = join(
        cacheDirectory,
        `.${derivativeDescriptor(request).name}.${process.pid}.${randomUUID()}.tmp`
      )
      try {
        const output = derivativeSize(asset, request)
        await sharp(resolvedOriginal, {
          failOn: 'error',
          limitInputPixels: this.maxInputPixels,
          sequentialRead: true
        })
          .autoOrient()
          .toColourspace('srgb')
          .resize({ width: output.width, height: output.height, fit: 'fill' })
          .webp({
            quality: request.variant === 'thumbnail' ? 76 : request.variant === 'preview' ? 82 : 90,
            effort: 4,
            smartSubsample: true
          })
          .toFile(temporaryPath)
        const temporary = await open(temporaryPath, 'r+')
        try {
          await temporary.sync()
        } finally {
          await temporary.close()
        }
        await publishTemporaryFile(temporaryPath, finalPath)
      } catch (error) {
        await unlink(temporaryPath).catch(() => undefined)
        throw error
      }
      const cached = await realpath(finalPath)
      if (!isPathInside(canonicalRoot, cached)) throw new Error('素材缓存越过项目边界。')
      return cached
    })
    this.inFlight.set(finalPath, operation)
    try {
      return await operation
    } finally {
      if (this.inFlight.get(finalPath) === operation) this.inFlight.delete(finalPath)
    }
  }

  /**
   * 写入消除结果派生图（由推理服务生成，与原图同像素尺寸）。
   * 走与其它派生图相同的安全目录、原子发布与 fsync 语义。
   */
  async writeErased(
    projectRoot: string,
    asset: StoredImageIdentity,
    eraseKey: string,
    image: Buffer
  ): Promise<string> {
    assertEraseKey(eraseKey)
    const canonicalRoot = await realpath(projectRoot)
    const relativePath = derivativeRelativePath(asset, {
      variant: 'erased',
      usage: { eraseKey }
    })
    const finalPath = toFileSystemPath(canonicalRoot, relativePath)
    if (!isPathInside(canonicalRoot, finalPath)) throw new Error('素材路径越过项目边界。')
    const cacheDirectory = await ensureSafeDirectory(canonicalRoot, [
      'assets',
      'cache',
      IMAGE_PIPELINE_VERSION,
      asset.contentHash
    ])
    const temporaryPath = join(
      cacheDirectory,
      `.erased-${eraseKey}.${process.pid}.${randomUUID()}.tmp`
    )
    try {
      await writeFile(temporaryPath, image)
      const temporary = await open(temporaryPath, 'r+')
      try {
        await temporary.sync()
      } finally {
        await temporary.close()
      }
      await publishTemporaryFile(temporaryPath, finalPath)
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined)
      throw error
    }
    const cached = await realpath(finalPath)
    if (!isPathInside(canonicalRoot, cached)) throw new Error('素材缓存越过项目边界。')
    return cached
  }
}

export const imageStore = new ImageStore()
