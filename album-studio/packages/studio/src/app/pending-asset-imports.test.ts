import { describe, expect, it, vi } from 'vitest'
import {
  hasPendingAssetImports,
  trackAssetImport,
  waitForAssetImports
} from './pending-asset-imports'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((onResolve) => {
    resolve = onResolve
  })
  return { promise, resolve }
}

describe('pending asset import barrier', () => {
  it('waits for every complete import transaction, including work after platform resolution', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    const afterWrite = vi.fn()
    const firstImport = trackAssetImport(async () => {
      await first.promise
      afterWrite('first')
    })
    const secondImport = trackAssetImport(async () => {
      await second.promise
      afterWrite('second')
    })
    const idle = waitForAssetImports()
    let settled = false
    void idle.then(() => {
      settled = true
    })

    first.resolve()
    await firstImport
    expect(settled).toBe(false)
    expect(hasPendingAssetImports()).toBe(true)

    second.resolve()
    await secondImport
    await idle
    expect(afterWrite.mock.calls).toEqual([['first'], ['second']])
    expect(hasPendingAssetImports()).toBe(false)
  })

  it('releases the barrier when an import fails', async () => {
    const failed = trackAssetImport(async () => {
      throw new Error('写入失败')
    })
    const idle = waitForAssetImports()

    await expect(failed).rejects.toThrow('写入失败')
    await expect(idle).resolves.toBeUndefined()
    expect(hasPendingAssetImports()).toBe(false)
  })
})
