import { useEffect, useState } from 'react'

/**
 * Reloads canvas font metrics when the requested fonts become ready.
 *
 * @param {{ fontFamily: string, fontSize: number }[]} fontRequests - Fonts and sizes used by the caller.
 * @returns {number} Readiness version for the requested fonts.
 */
export function useFontMetrics(fontRequests = []) {
  const requestKey = JSON.stringify(fontRequests)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!requestKey || requestKey === '[]' || typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') {
      return undefined
    }

    let cancelled = false
    const requests = JSON.parse(requestKey)

    Promise.allSettled([
      ...requests.map(({ fontFamily, fontSize }) => document.fonts.load(`${fontSize}px ${fontFamily}`, '0123456789WBMPRK/H')),
      document.fonts.ready,
    ]).finally(() => {
      if (!cancelled) setVersion((current) => current + 1)
    })

    return () => {
      cancelled = true
    }
  }, [requestKey])

  return version
}
