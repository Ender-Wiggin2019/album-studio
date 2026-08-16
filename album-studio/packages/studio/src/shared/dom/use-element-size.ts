import { useLayoutEffect, useState, type RefObject } from 'react'

export type ElementSize = { width: number; height: number }

export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const update = (): void => {
      const { width, height } = element.getBoundingClientRect()
      if (width > 0 && height > 0) setSize({ width, height })
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
