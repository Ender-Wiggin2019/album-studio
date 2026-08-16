import type { AlbumDocument } from '@album-studio/common'

export type ProjectSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export type SaveDocumentResult = {
  revision: number
  savedAt: string
}

export type SaveDocument = (document: AlbumDocument) => Promise<SaveDocumentResult>

export type ProjectSaveSnapshot = Readonly<{
  state: ProjectSaveState
  savedRevision: number
  error: string | null
}>

export type ProjectSaveSession = {
  connect(saveDocument: SaveDocument): void
  open(document: AlbumDocument): void
  changed(document: AlbumDocument): void
  close(): void
  flush(): Promise<void>
  retry(): void
  snapshot(): ProjectSaveSnapshot
}

type ProjectSaveSessionOptions = {
  debounceMs?: number
  onStateChange?: (snapshot: ProjectSaveSnapshot) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '自动保存失败'
}

export function createProjectSaveSession(
  options: ProjectSaveSessionOptions = {}
): ProjectSaveSession {
  const debounceMs = options.debounceMs ?? 650
  let latestDocument: AlbumDocument | null = null
  let savedRevision = 0
  let state: ProjectSaveState = 'idle'
  let error: string | null = null
  let saveDocument: SaveDocument | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let savePump: Promise<void> | null = null
  let generation = 0

  const snapshot = (): ProjectSaveSnapshot => ({ state, savedRevision, error })

  const publish = (nextState: ProjectSaveState, nextError: string | null = null): void => {
    state = nextState
    error = nextError
    options.onStateChange?.(snapshot())
  }

  const clearScheduledSave = (): void => {
    if (saveTimer === null) return
    clearTimeout(saveTimer)
    saveTimer = null
  }

  const runPump = async (): Promise<void> => {
    while (latestDocument && latestDocument.revision > savedRevision) {
      if (!saveDocument) {
        const unavailable = new Error('保存服务尚未连接，请稍后重试。')
        publish('error', unavailable.message)
        throw unavailable
      }

      const candidate = latestDocument
      const candidateGeneration = generation
      publish('saving')
      try {
        const result = await saveDocument(candidate)
        if (candidateGeneration !== generation) continue
        if (result.revision !== candidate.revision) {
          throw new Error(
            `保存结果 revision 不一致：请求 ${candidate.revision}，返回 ${result.revision}`
          )
        }
        savedRevision = result.revision
        publish(latestDocument.revision === savedRevision ? 'saved' : 'dirty')
      } catch (saveError) {
        if (candidateGeneration !== generation) continue
        if (latestDocument.revision > candidate.revision) {
          publish('dirty')
          continue
        }
        const message = errorMessage(saveError)
        publish('error', message)
        throw saveError instanceof Error ? saveError : new Error(message)
      }
    }
  }

  const ensurePump = (): Promise<void> => {
    if (savePump) return savePump
    const currentPump = runPump().finally(() => {
      if (savePump === currentPump) savePump = null
      if (
        state === 'dirty' &&
        latestDocument &&
        latestDocument.revision > savedRevision &&
        saveTimer === null
      ) {
        scheduleSave()
      }
    })
    savePump = currentPump
    return currentPump
  }

  const scheduleSave = (): void => {
    if (!saveDocument || savePump || !latestDocument || latestDocument.revision <= savedRevision) {
      return
    }
    clearScheduledSave()
    saveTimer = setTimeout(() => {
      saveTimer = null
      void ensurePump().catch(() => undefined)
    }, debounceMs)
  }

  return {
    connect(nextSaveDocument) {
      saveDocument = nextSaveDocument
      if (state === 'dirty') scheduleSave()
    },
    open(document) {
      generation += 1
      clearScheduledSave()
      latestDocument = document
      savedRevision = document.revision
      publish('saved')
    },
    changed(document) {
      if (latestDocument?.id !== document.id) generation += 1
      latestDocument = document
      publish('dirty')
      scheduleSave()
    },
    close() {
      generation += 1
      clearScheduledSave()
      latestDocument = null
      savedRevision = 0
      publish('idle')
    },
    async flush() {
      clearScheduledSave()
      while (latestDocument && latestDocument.revision > savedRevision) {
        await ensurePump()
      }
    },
    retry() {
      if (!latestDocument || latestDocument.revision <= savedRevision) return
      publish('dirty')
      scheduleSave()
    },
    snapshot
  }
}
