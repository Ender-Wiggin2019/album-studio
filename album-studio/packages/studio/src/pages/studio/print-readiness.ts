import type { PrintBookReadyResult } from '@/features/canvas/album-page-view'

export type { PrintBookReadyResult } from '@/features/canvas/album-page-view'

export type PrintReadinessResult = PrintBookReadyResult &
  Readonly<{
    timedOut: boolean
  }>

/** Only a deadlock guard; normal processing resolves through the per-image protocol. */
export const PRINT_READINESS_TIMEOUT_MS = 120_000

export async function waitForPrintReadiness(
  readiness: Promise<PrintBookReadyResult>,
  timeoutMs = PRINT_READINESS_TIMEOUT_MS
): Promise<PrintReadinessResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<PrintReadinessResult>((resolve) => {
    timeout = setTimeout(
      () => resolve({ totalImages: 0, fallbackCount: 0, timedOut: true }),
      timeoutMs
    )
  })

  try {
    return await Promise.race([
      readiness.then((result) => ({ ...result, timedOut: false })),
      timedOut
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}
