import '@testing-library/jest-dom/vitest'

if (!('ResizeObserver' in globalThis)) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class ResizeObserver {
      observe(): void {
        return undefined
      }
      unobserve(): void {
        return undefined
      }
      disconnect(): void {
        return undefined
      }
    }
  })
}
