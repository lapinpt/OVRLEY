import { useCallback, useEffect, useRef, useState } from 'react'
import { fitRangeToViewport, fitToFull, followPlayhead, panViewport, zoomRange } from '../utils/playerTimeline'

/**
 * Holds the visible window { viewStart, viewEnd } as local React state
 * and exposes zoom, fit, reset, pan, and follow actions.
 *
 * @param {object} options
 * @param {number} options.totalDuration - Total playable duration in seconds.
 * @param {number} [options.videoSyncOffsetSeconds] - Video sync offset for fitVideo.
 * @param {number} [options.importedVideoDuration] - Imported video duration for fitVideo.
 * @param {number} [options.activityDurationSeconds] - Activity duration for fitActivity.
 * @param {number} [options.fallbackDurationSeconds] - Fallback duration for fitActivity.
 * @param {number} [options.widthPx] - Measured timeline width used for the maximum zoom clamp.
 * @param {boolean} [options.isPlaying] - Whether playback is active (drives follow effect).
 * @param {number} [options.playheadSecond] - Current playhead position (drives follow effect).
 * @param {boolean} [options.isDragging] - Whether a scrub/pan drag is active (suspends follow).
 * @returns {{ viewport: { viewStart: number, viewEnd: number }, zoomBy: function, fitAll: function, fitVideo: function, fitActivity: function, resetView: function, panBy: function }}
 */
export default function useTimelineViewport({
  totalDuration,
  videoSyncOffsetSeconds = 0,
  importedVideoDuration = 0,
  activityDurationSeconds = 0,
  fallbackDurationSeconds = 0,
  widthPx = 0,
  isPlaying = false,
  playheadSecond = 0,
  isDragging = false,
}) {
  const [viewport, setViewport] = useState(() => fitToFull(totalDuration))

  const totalDurationRef = useRef(totalDuration)
  useEffect(() => {
    totalDurationRef.current = totalDuration
  }, [totalDuration])

  useEffect(() => {
    setViewport(fitToFull(totalDuration))
  }, [totalDuration])

  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    if (!isPlaying || isDragging) return
    setViewport((prev) =>
      followPlayhead({
        playheadSecond,
        viewStart: prev.viewStart,
        viewEnd: prev.viewEnd,
        totalDuration: totalDurationRef.current,
      }),
    )
  }, [isPlaying, playheadSecond, isDragging])

  const zoomBy = useCallback(
    (direction, pivot) => {
      setViewport((prev) =>
        zoomRange({
          viewStart: prev.viewStart,
          viewEnd: prev.viewEnd,
          pivot,
          direction,
          totalDuration: totalDurationRef.current,
          widthPx,
        }),
      )
    },
    [widthPx],
  )

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

  const panBy = useCallback((deltaSeconds) => {
    setViewport((prev) =>
      panViewport({
        viewStart: prev.viewStart,
        viewEnd: prev.viewEnd,
        deltaSeconds,
        totalDuration: totalDurationRef.current,
      }),
    )
  }, [])

  return { viewport, zoomBy, fitAll, fitVideo, fitActivity, resetView, panBy }
}
