import { useEffect, useState } from 'react'

export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback
  )

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(query)
    const update = (): void => setMatches(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [query])

  return matches
}
