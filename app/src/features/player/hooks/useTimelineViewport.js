import { useCallback, useEffect, useRef, useState } from 'react'
import { fitRangeToViewport, fitToFull, zoomRange } from '../utils/playerTimeline'

/**
 * Holds the visible window { viewStart, viewEnd } as local React state
 * and exposes zoom, fit, and reset actions.
 *
 * @param {object} options
 * @param {number} options.totalDuration - Total playable duration in seconds.
 * @param {number} [options.videoSyncOffsetSeconds] - Video sync offset for fitVideo.
 * @param {number} [options.importedVideoDuration] - Imported video duration for fitVideo.
 * @param {number} [options.activityDurationSeconds] - Activity duration for fitActivity.
 * @param {number} [options.fallbackDurationSeconds] - Fallback duration for fitActivity.
 * @returns {{ viewport: { viewStart: number, viewEnd: number }, zoomBy: function, fitAll: function, fitVideo: function, fitActivity: function, resetView: function }}
 */
export default function useTimelineViewport({
  totalDuration,
  videoSyncOffsetSeconds = 0,
  importedVideoDuration = 0,
  activityDurationSeconds = 0,
  fallbackDurationSeconds = 0,
}) {
  const [viewport, setViewport] = useState(() => fitToFull(totalDuration))

  const totalDurationRef = useRef(totalDuration)
  useEffect(() => {
    totalDurationRef.current = totalDuration
  }, [totalDuration])

  useEffect(() => {
    setViewport(fitToFull(totalDuration))
  }, [totalDuration])

  const zoomBy = useCallback((direction, pivot) => {
    setViewport((prev) =>
      zoomRange({
        viewStart: prev.viewStart,
        viewEnd: prev.viewEnd,
        pivot,
        direction,
        totalDuration: totalDurationRef.current,
      }),
    )
  }, [])

  const fitAll = useCallback(() => {
    setViewport(fitToFull(totalDurationRef.current))
  }, [])

  const fitVideo = useCallback(() => {
    const total = totalDurationRef.current
    const start = Math.max(0, Number(videoSyncOffsetSeconds) || 0)
    const end = start + (Number(importedVideoDuration) || 0)
    setViewport(fitRangeToViewport({ rangeStart: start, rangeEnd: end, totalDuration: total }))
  }, [videoSyncOffsetSeconds, importedVideoDuration])

  const fitActivity = useCallback(() => {
    const total = totalDurationRef.current
    const duration = activityDurationSeconds > 0 ? activityDurationSeconds : fallbackDurationSeconds
    setViewport(fitRangeToViewport({ rangeStart: 0, rangeEnd: duration, totalDuration: total }))
  }, [activityDurationSeconds, fallbackDurationSeconds])

  const resetView = useCallback(() => {
    setViewport(fitToFull(totalDurationRef.current))
  }, [])

  return { viewport, zoomBy, fitAll, fitVideo, fitActivity, resetView }
}
