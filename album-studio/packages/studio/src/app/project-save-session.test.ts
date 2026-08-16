import { createAlbumDocument, type AlbumDocument } from '@album-studio/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProjectSaveSession, type SaveDocumentResult } from './project-save-session'

function documentAt(revision: number): AlbumDocument {
  const document = createAlbumDocument({
    title: '会话测试相册',
    now: '2026-08-16T00:00:00.000Z'
  })
  return {
    ...document,
    revision,
    updatedAt: `2026-08-16T00:00:0${revision}.000Z`
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(reason: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

function saved(revision: number): SaveDocumentResult {
  return { revision, savedAt: `2026-08-16T00:01:0${revision}.000Z` }
}

afterEach(() => vi.useRealTimers())

describe('project save session', () => {
  it('persists a newer edit that arrives while an older revision is saving', async () => {
    const first = deferred<SaveDocumentResult>()
    const second = deferred<SaveDocumentResult>()
    const saveDocument = vi.fn((document: AlbumDocument) =>
      document.revision === 1 ? first.promise : second.promise
    )
    const states: string[] = []
    const session = createProjectSaveSession({
      onStateChange: (snapshot) => states.push(snapshot.state)
    })
    session.connect(saveDocument)
    session.open(documentAt(0))
    session.changed(documentAt(1))

    const flushed = session.flush()
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }))
    session.changed(documentAt(2))
    first.resolve(saved(1))
    await vi.waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2))
    second.resolve(saved(2))
    await flushed

    expect(saveDocument.mock.calls.map(([document]) => document.revision)).toEqual([1, 2])
    expect(session.snapshot()).toEqual({ state: 'saved', savedRevision: 2, error: null })
    expect(states.at(-1)).toBe('saved')
  })

  it('does not let an obsolete failure overwrite a newer successful save', async () => {
    const first = deferred<SaveDocumentResult>()
    const saveDocument = vi.fn((document: AlbumDocument) =>
      document.revision === 1 ? first.promise : Promise.resolve(saved(document.revision))
    )
    const session = createProjectSaveSession()
    session.connect(saveDocument)
    session.open(documentAt(0))
    session.changed(documentAt(1))

    const flushed = session.flush()
    session.changed(documentAt(2))
    first.reject(new Error('旧 revision 保存失败'))
    await flushed

    expect(saveDocument.mock.calls.map(([document]) => document.revision)).toEqual([1, 2])
    expect(session.snapshot()).toEqual({ state: 'saved', savedRevision: 2, error: null })
  })

  it('debounces consecutive edits and persists only the latest snapshot', async () => {
    vi.useFakeTimers()
    const saveDocument = vi.fn(async (document: AlbumDocument) => saved(document.revision))
    const session = createProjectSaveSession({ debounceMs: 650 })
    session.connect(saveDocument)
    session.open(documentAt(0))
    session.changed(documentAt(1))
    session.changed(documentAt(2))

    expect(saveDocument).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(650)

    expect(saveDocument).toHaveBeenCalledTimes(1)
    expect(saveDocument).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }))
    expect(session.snapshot().state).toBe('saved')
  })

  it('reports the latest failure and retries through the same ordered queue', async () => {
    const saveDocument = vi
      .fn<(document: AlbumDocument) => Promise<SaveDocumentResult>>()
      .mockRejectedValueOnce(new Error('磁盘暂时不可写'))
      .mockResolvedValueOnce(saved(1))
    const session = createProjectSaveSession()
    session.connect(saveDocument)
    session.open(documentAt(0))
    session.changed(documentAt(1))

    await expect(session.flush()).rejects.toThrow('磁盘暂时不可写')
    expect(session.snapshot()).toEqual({
      state: 'error',
      savedRevision: 0,
      error: '磁盘暂时不可写'
    })

    session.retry()
    await session.flush()
    expect(saveDocument).toHaveBeenCalledTimes(2)
    expect(session.snapshot()).toEqual({ state: 'saved', savedRevision: 1, error: null })
  })
})
