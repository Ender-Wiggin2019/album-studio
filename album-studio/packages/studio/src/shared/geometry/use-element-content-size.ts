import { useLayoutEffect, useState } from 'react'
import { measureElementContentBox, type FittedSize } from './fit-aspect-ratio'

export function useElementContentSize(element: HTMLElement | null): FittedSize | null {
  const [size, setSize] = useState<FittedSize | null>(null)

  useLayoutEffect(() => {
    if (!element) return

    let active = true
    const update = (): void => {
      if (active) setSize(measureElementContentBox(element))
    }

    queueMicrotask(update)
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        active = false
      }
    }

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [element])

  return element ? size : null
}
