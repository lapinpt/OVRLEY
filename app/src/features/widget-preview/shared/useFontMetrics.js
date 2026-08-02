/**
 * Returns a version token that changes after the requested font becomes ready.
 *
 * Used to trigger re-renders of preview components once font metrics are available,
 * ensuring accurate text measurement after font loading.
 *
 * @param {string} fontFamily - Font family to await.
 * @param {number} fontSize - Font size in pixels to load.
 * @returns {number} Version counter — increments each time the font finishes loading.
 */

import { useEffect, useState, useSyncExternalStore } from 'react'

const fontMetricsStore = {
  epoch: 0,
  listeners: new Set(),
  getSnapshot: () => fontMetricsStore.epoch,
  publish() {
    fontMetricsStore.epoch += 1
    for (const listener of fontMetricsStore.listeners) listener()
  },
  subscribe(listener) {
    fontMetricsStore.listeners.add(listener)
    return () => fontMetricsStore.listeners.delete(listener)
  },
}

/**
 * Returns the shared font-metrics invalidation epoch.
 *
 * @returns {number} Epoch that changes whenever a requested font finishes loading.
 */
export function useFontMetricsEpoch() {
  return useSyncExternalStore(fontMetricsStore.subscribe, fontMetricsStore.getSnapshot, fontMetricsStore.getSnapshot)
}

export function useFontMetricsVersion(fontFamily, fontSize) {
  // State — version token incremented when font metrics are refreshed
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.load !== 'function') {
      return undefined
    }

    let cancelled = false

    const refreshMetrics = async () => {
      try {
        await Promise.allSettled([document.fonts.load(`${fontSize}px ${fontFamily}`, '0123456789WBMPRK/H'), document.fonts.ready])
      } finally {
        if (!cancelled) {
          fontMetricsStore.publish()
          setVersion((current) => current + 1)
        }
      }
    }

    refreshMetrics()

    // Cleanup — cancels pending font load on unmount or re-render
    return () => {
      cancelled = true
    }
  }, [fontFamily, fontSize])

  return version
}
