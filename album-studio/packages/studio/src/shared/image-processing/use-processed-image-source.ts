import { useEffect, useRef, useState } from 'react'
import {
  acquireDerivedImage,
  type DerivedImageSnapshot,
  type DerivedImageTaskClass
} from './derived-image-cache'

export type ProcessedImageSourceState = Readonly<{
  source: string | null
  pending: boolean
  failed: boolean
  /** The original processing failure, retained for diagnostics and recovery UI. */
  error?: unknown
}>

type ProcessedResult = Readonly<{
  key: string
  source: string
  snapshot: DerivedImageSnapshot
}>

type InternalState = Readonly<{
  identity: string | null
  result: ProcessedResult | null
}>

const EMPTY_STATE: ProcessedImageSourceState = {
  source: null,
  pending: false,
  failed: false
}

export function useProcessedImageSource(input: {
  source: string | null
  active: boolean
  requestKey: string
  process: (source: string) => Promise<string>
  debounceMs: number
  taskClass?: DerivedImageTaskClass
}): ProcessedImageSourceState {
  const { source, active, requestKey, process, debounceMs, taskClass = 'interactive' } = input
  const requestRef = useRef(0)
  const requestIdentity = active && source ? JSON.stringify([requestKey, source, taskClass]) : null
  const [state, setState] = useState<InternalState>({
    identity: requestIdentity,
    result: null
  })
  if (state.identity !== requestIdentity) {
    setState({ identity: requestIdentity, result: null })
  }
  const result = state.identity === requestIdentity ? state.result : null

  useEffect(() => {
    if (!active || !source) return
    const requestId = ++requestRef.current
    const leaseIdentity = JSON.stringify([requestKey, source, taskClass])
    const lease = acquireDerivedImage({ requestKey, source, process, debounceMs, taskClass })
    const update = (): void => {
      if (requestId !== requestRef.current) return
      setState((current) =>
        current.identity === leaseIdentity
          ? {
              identity: current.identity,
              result: { key: requestKey, source, snapshot: lease.getSnapshot() }
            }
          : current
      )
    }
    const unsubscribe = lease.subscribe(update)

    return () => {
      if (requestId === requestRef.current) requestRef.current += 1
      unsubscribe()
      lease.release()
    }
  }, [active, debounceMs, process, requestKey, source, taskClass])

  if (!source) return EMPTY_STATE
  if (!active) return { source, pending: false, failed: false }
  if (result?.key !== requestKey || result.source !== source) {
    return { source, pending: true, failed: false }
  }
  if (result.snapshot.status === 'ready') {
    return { source: result.snapshot.source, pending: false, failed: false }
  }
  if (result.snapshot.status === 'failed') {
    return { source, pending: false, failed: true, error: result.snapshot.error }
  }
  return { source, pending: true, failed: false }
}
