let pendingCount = 0
const idleWaiters = new Set<() => void>()

export function hasPendingAssetImports(): boolean {
  return pendingCount > 0
}

export function waitForAssetImports(): Promise<void> {
  if (pendingCount === 0) return Promise.resolve()
  return new Promise((resolve) => idleWaiters.add(resolve))
}

/**
 * Keeps window/document teardown behind the complete import transaction:
 * platform writes, document registration, and UI/session cleanup.
 */
export async function trackAssetImport<T>(operation: () => Promise<T>): Promise<T> {
  pendingCount += 1
  try {
    return await operation()
  } finally {
    pendingCount -= 1
    if (pendingCount === 0) {
      for (const resolve of idleWaiters) resolve()
      idleWaiters.clear()
    }
  }
}
