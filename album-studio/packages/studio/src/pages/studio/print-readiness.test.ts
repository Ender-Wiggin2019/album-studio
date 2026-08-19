import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PRINT_READINESS_TIMEOUT_MS,
  waitForPrintReadiness,
  type PrintBookReadyResult
} from './print-readiness'

afterEach(() => {
  vi.useRealTimers()
})

describe('waitForPrintReadiness', () => {
  it('returns the explicit PrintBook result without waiting for the timeout', async () => {
    vi.useFakeTimers()
    const result: PrintBookReadyResult = { totalImages: 2, fallbackCount: 1 }

    await expect(waitForPrintReadiness(Promise.resolve(result))).resolves.toEqual({
      ...result,
      timedOut: false
    })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports a timeout so the caller can abort instead of exporting an unfinished tree', async () => {
    vi.useFakeTimers()
    const pending = new Promise<PrintBookReadyResult>(() => undefined)
    const result = waitForPrintReadiness(pending)

    await act(async () => vi.advanceTimersByTime(PRINT_READINESS_TIMEOUT_MS - 1))
    let settled = false
    void result.then(() => {
      settled = true
    })
    await act(async () => undefined)
    expect(settled).toBe(false)

    await act(async () => vi.advanceTimersByTime(1))
    await expect(result).resolves.toEqual({ totalImages: 0, fallbackCount: 0, timedOut: true })
  })
})
