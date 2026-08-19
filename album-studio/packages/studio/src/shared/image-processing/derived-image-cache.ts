export type DerivedImageSnapshot =
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'ready'; source: string }>
  | Readonly<{ status: 'failed'; error: unknown }>

export type DerivedImageTaskClass = 'interactive' | 'full-resolution'

export type DerivedImageLease = Readonly<{
  getSnapshot: () => DerivedImageSnapshot
  subscribe: (listener: () => void) => () => void
  release: () => void
}>

type CacheEntry = {
  key: string
  inputSource: string
  references: number
  snapshot: DerivedImageSnapshot
  listeners: Set<() => void>
  timer: number | null
  started: boolean
}

const entries = new Map<string, CacheEntry>()

type FullResolutionTask = Readonly<{
  entry: CacheEntry
  start: (onSettled: () => void) => void
}>

const fullResolutionQueue: FullResolutionTask[] = []
let fullResolutionRunning = false

function drainFullResolutionQueue(): void {
  if (fullResolutionRunning) return
  let task = fullResolutionQueue.shift()
  while (task && (entries.get(task.entry.key) !== task.entry || task.entry.references === 0)) {
    task = fullResolutionQueue.shift()
  }
  if (!task) return

  fullResolutionRunning = true
  task.start(() => {
    fullResolutionRunning = false
    drainFullResolutionQueue()
  })
}

function scheduleFullResolutionTask(task: FullResolutionTask): void {
  fullResolutionQueue.push(task)
  drainFullResolutionQueue()
}

function removeEntry(entry: CacheEntry): void {
  if (entries.get(entry.key) !== entry) return
  entries.delete(entry.key)
  for (let index = fullResolutionQueue.length - 1; index >= 0; index -= 1) {
    if (fullResolutionQueue[index]?.entry === entry) fullResolutionQueue.splice(index, 1)
  }
  if (entry.timer !== null) window.clearTimeout(entry.timer)
  if (entry.snapshot.status === 'ready' && entry.snapshot.source !== entry.inputSource) {
    URL.revokeObjectURL(entry.snapshot.source)
  }
}

function publish(entry: CacheEntry, snapshot: DerivedImageSnapshot): void {
  if (entries.get(entry.key) !== entry) {
    if (snapshot.status === 'ready' && snapshot.source !== entry.inputSource) {
      URL.revokeObjectURL(snapshot.source)
    }
    return
  }

  entry.snapshot = snapshot
  if (entry.references === 0) {
    removeEntry(entry)
    return
  }
  for (const listener of entry.listeners) listener()
}

function createEntry(
  key: string,
  source: string,
  process: (source: string) => Promise<string>,
  debounceMs: number,
  taskClass: DerivedImageTaskClass
): CacheEntry {
  const entry: CacheEntry = {
    key,
    inputSource: source,
    references: 0,
    snapshot: { status: 'pending' },
    listeners: new Set(),
    timer: null,
    started: false
  }
  entries.set(key, entry)
  entry.timer = window.setTimeout(() => {
    entry.timer = null
    const start = (onSettled: () => void): void => {
      if (entries.get(entry.key) !== entry || entry.references === 0) {
        onSettled()
        return
      }
      entry.started = true
      const settle = (snapshot: DerivedImageSnapshot): void => {
        try {
          publish(entry, snapshot)
        } finally {
          onSettled()
        }
      }
      try {
        void process(source).then(
          (processedSource) => settle({ status: 'ready', source: processedSource }),
          (error: unknown) => settle({ status: 'failed', error })
        )
      } catch (error: unknown) {
        settle({ status: 'failed', error })
      }
    }
    if (taskClass === 'full-resolution') {
      scheduleFullResolutionTask({ entry, start })
    } else {
      start(() => undefined)
    }
  }, debounceMs)
  return entry
}

/**
 * Shares one in-flight/result derivative across mounted consumers.
 *
 * The lease owns one reference. A ready Blob URL is revoked exactly when the
 * final reference is released. Work abandoned before the shared debounce is
 * cancelled; already-started work stays reusable until it settles, then its
 * late Blob URL is revoked immediately when no references remain.
 */
export function acquireDerivedImage(input: {
  requestKey: string
  source: string
  process: (source: string) => Promise<string>
  debounceMs: number
  taskClass: DerivedImageTaskClass
}): DerivedImageLease {
  // Include the concrete input URL even when callers use a semantic resource
  // key. This prevents a relink or pipeline-version change from reusing bytes
  // produced from an obsolete source.
  const key = JSON.stringify([input.requestKey, input.source, input.taskClass])
  const entry =
    entries.get(key) ??
    createEntry(key, input.source, input.process, input.debounceMs, input.taskClass)
  entry.references += 1
  let released = false
  const leaseListeners = new Set<() => void>()

  return {
    getSnapshot: () => entry.snapshot,
    subscribe(listener) {
      if (released) return () => undefined
      entry.listeners.add(listener)
      leaseListeners.add(listener)
      if (entry.snapshot.status !== 'pending') {
        queueMicrotask(() => {
          if (entry.listeners.has(listener)) listener()
        })
      }
      return () => {
        leaseListeners.delete(listener)
        entry.listeners.delete(listener)
      }
    },
    release() {
      if (released) return
      released = true
      for (const listener of leaseListeners) entry.listeners.delete(listener)
      leaseListeners.clear()
      entry.references -= 1
      if (entry.references === 0 && (entry.snapshot.status !== 'pending' || !entry.started)) {
        removeEntry(entry)
      }
    }
  }
}
