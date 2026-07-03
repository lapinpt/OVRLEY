import { useEffect, useState } from 'react'
import { fitToFull } from '../utils/playerTimeline'

/**
 * Holds the visible window { viewStart, viewEnd } as local React state.
 * Full-range only in S1 — no zoom actions yet. Re-fits to the full range
 * whenever totalDuration changes.
 *
 * @param {number} totalDuration - Total playable duration in seconds.
 * @returns {{ viewStart: number, viewEnd: number }} Current viewport.
 */
export default function useTimelineViewport(totalDuration) {
  const [viewport, setViewport] = useState(() => fitToFull(totalDuration))

  useEffect(() => {
    setViewport(fitToFull(totalDuration))
  }, [totalDuration])

  return viewport
}
