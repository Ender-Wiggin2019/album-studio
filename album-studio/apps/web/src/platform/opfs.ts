const DATA_DIRECTORY = 'album-studio'

type IterableDirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>
}

function assertSafeSegment(segment: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(segment)) {
    throw new Error(`Invalid OPFS path segment: ${segment}`)
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  return (await navigator.storage.persist?.()) ?? false
}

export async function getDataDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(DATA_DIRECTORY, { create: true })
}

export async function getProjectsDirectory(): Promise<FileSystemDirectoryHandle> {
  const root = await getDataDirectory()
  return root.getDirectoryHandle('projects', { create: true })
}

export async function getProjectDirectory(
  projectId: string,
  create = false
): Promise<FileSystemDirectoryHandle> {
  assertSafeSegment(projectId)
  const projects = await getProjectsDirectory()
  return projects.getDirectoryHandle(projectId, { create })
}

export async function getNestedDirectory(
  parent: FileSystemDirectoryHandle,
  segments: string[],
  create = false
): Promise<FileSystemDirectoryHandle> {
  let directory = parent
  for (const segment of segments) {
    assertSafeSegment(segment)
    directory = await directory.getDirectoryHandle(segment, { create })
  }
  return directory
}

export async function writeFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  value: Blob | string
): Promise<void> {
  assertSafeSegment(name.replace(/\.[a-z0-9]+$/i, ''))
  const handle = await directory.getFileHandle(name, { create: true })
  const writable = await handle.createWritable({ keepExistingData: false })
  try {
    await writable.write(value)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}

export async function readFile(directory: FileSystemDirectoryHandle, name: string): Promise<File> {
  return (await directory.getFileHandle(name)).getFile()
}

export async function readJson<T>(directory: FileSystemDirectoryHandle, name: string): Promise<T> {
  const file = await readFile(directory, name)
  return JSON.parse(await file.text()) as T
}

export async function writeJson(
  directory: FileSystemDirectoryHandle,
  name: string,
  value: unknown
): Promise<void> {
  await writeFile(directory, name, `${JSON.stringify(value, null, 2)}\n`)
}

export async function fileExists(
  directory: FileSystemDirectoryHandle,
  name: string
): Promise<boolean> {
  try {
    await directory.getFileHandle(name)
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return false
    throw error
  }
}

export async function listProjectIds(): Promise<string[]> {
  const projects = (await getProjectsDirectory()) as IterableDirectoryHandle
  const ids: string[] = []
  for await (const handle of projects.values()) {
    if (handle.kind === 'directory') ids.push(handle.name)
  }
  return ids
}
