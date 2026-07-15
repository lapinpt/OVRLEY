/**
 * Orchestrates playback state, scrub state, and timeline-driven animation frames.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getContainerFps } from '@/lib/update-rate'
import { clamp } from '@/lib/utils'
import { createPlaybackAnchor, getTimelinePlaybackSecond, getTotalPlaybackDuration, resolvePlaybackSource } from '../utils/playerTiming'

/**
 * Manages the player clock and exposes direct second-based playback commands.
 *
 * @param {object} options Playback engine inputs from the player store.
 * @param {object|null} options.activitySummary Imported activity summary metadata.
 * @param {string} options.backgroundMode Active preview background mode.
 * @param {function} options.beginPreviewScrub Store action for entering scrub mode.
 * @param {function} options.commitPreviewScrub Store action for committing scrub mode.
 * @param {number} options.fallbackDurationSeconds Fallback timeline duration without activity metadata.
 * @param {number|null} options.importedVideoDuration Imported video duration in seconds.
 * @param {string|null} options.importedVideoPath Imported video path when video is available.
 * @param {function} options.pausePreviewPlayback Store action for pausing preview playback.
 * @param {string} options.previewPlaybackSource Current playback clock owner.
 * @param {string} options.previewPlaybackState Current playback state.
 * @param {number} options.sceneFps Scene frames per second.
 * @param {number} options.selectedSecond Store playhead position.
 * @param {function} options.setSelectedSecond Store action for setting the playhead.
 * @param {function} options.startPreviewPlayback Store action for starting playback.
 * @param {function} options.updatePreviewScrub Store action for updating active scrub mode.
 * @param {number} options.updateRate Preview update-rate divisor.
 * @param {number} options.videoSyncOffsetSeconds Timeline second where video starts.
 * @returns {object} Playback state and direct second-based commands.
 */
export default function usePlaybackEngine({
  activitySummary,
  backgroundMode,
  beginPreviewScrub,
  commitPreviewScrub,
  fallbackDurationSeconds,
  importedVideoDuration,
  importedVideoPath,
  pausePreviewPlayback,
  previewPlaybackSource,
  previewPlaybackState,
  sceneFps,
  selectedSecond,
  setSelectedSecond,
  startPreviewPlayback,
  updatePreviewScrub,
  updateRate,
  videoSyncOffsetSeconds,
}) {
  // Local scrub state - lets the dragged playhead render immediately before the store commit lands.
  const [dragSecond, setDragSecond] = useState(null)

  // Imperative playback refs - RAF reads these without forcing React renders every frame.
  const playbackAnchorRef = useRef({ startedAtMs: 0, startedSecond: 0 })
  const totalDurationRef = useRef(0)
  const previewFrameRef = useRef(-1)

  // Duration derivation - activity, fallback templates, and imported video can each extend the playable range.
  const totalDuration = useMemo(
    () =>
      getTotalPlaybackDuration({
        activityDurationSeconds: activitySummary?.durationSeconds,
        fallbackDurationSeconds,
        importedVideoDuration,
        importedVideoPath,
        videoSyncOffsetSeconds,
      }),
    [activitySummary?.durationSeconds, fallbackDurationSeconds, importedVideoDuration, importedVideoPath, videoSyncOffsetSeconds],
  )

  const hasActivity = Boolean(activitySummary && totalDuration > 0)
  const shouldUseVideoPlayback = backgroundMode === 'video' && Boolean(importedVideoPath)
  const isPlaying = previewPlaybackState === 'playing'
  const isTimelinePlaybackActive = previewPlaybackState === 'playing' && previewPlaybackSource === 'timeline'
  const clampedPlayhead = clamp(Number(selectedSecond) || 0, 0, totalDuration)
  const displayedPlayhead = clamp(dragSecond === null ? clampedPlayhead : dragSecond, 0, totalDuration)
  const effectivePreviewFps = useMemo(() => getContainerFps(sceneFps, updateRate), [sceneFps, updateRate])

  // Shared reset path - any explicit playback command clears transient drag/frame ownership.
  const resetPlaybackOrchestration = useCallback(() => {
    previewFrameRef.current = -1
    setDragSecond(null)
  }, [])

  const setPlaybackAnchor = useCallback((source, second) => {
    playbackAnchorRef.current = createPlaybackAnchor({
      source,
      second,
      nowMs: performance.now(),
    })
  }, [])

  // Pause commands all anchor to the video clock because timeline wall-clock progression should stop.
  const pauseAtSecond = useCallback(
    (second) => {
      setPlaybackAnchor('video', second)
      resetPlaybackOrchestration()
      pausePreviewPlayback(second)
    },
    [pausePreviewPlayback, resetPlaybackOrchestration, setPlaybackAnchor],
  )

  // Duration ref sync - keeps the RAF loop on latest bounds without restarting it every render.
  useEffect(() => {
    totalDurationRef.current = totalDuration
  }, [totalDuration])

  // Playhead bounds sync - clamps stale store values when media duration changes under the player.
  useEffect(() => {
    if (!hasActivity) {
      playbackAnchorRef.current = { startedAtMs: 0, startedSecond: 0 }
      return
    }
    if (clampedPlayhead !== selectedSecond) {
      setSelectedSecond(clampedPlayhead)
    }
  }, [clampedPlayhead, hasActivity, selectedSecond, setSelectedSecond])

  // Video availability guard - if video playback is no longer possible, hand ownership back to a paused state.
  useEffect(() => {
    if (previewPlaybackSource !== 'video' || shouldUseVideoPlayback) {
      return
    }
    resetPlaybackOrchestration()
    setPlaybackAnchor('video', clampedPlayhead)
    pausePreviewPlayback(clampedPlayhead)
  }, [clampedPlayhead, pausePreviewPlayback, previewPlaybackSource, resetPlaybackOrchestration, setPlaybackAnchor, shouldUseVideoPlayback])

  // Clock handoff - while playing in video mode, switch between video and timeline clocks at video boundaries.
  useEffect(() => {
    if (!isPlaying || !shouldUseVideoPlayback) {
      return
    }
    const nextSource = resolvePlaybackSource({
      shouldUseVideoPlayback,
      playheadSecond: clampedPlayhead,
      videoSyncOffsetSeconds,
      importedVideoDuration,
    })
    if (nextSource === previewPlaybackSource) {
      return
    }
    resetPlaybackOrchestration()
    setPlaybackAnchor(nextSource, clampedPlayhead)
    startPreviewPlayback({
      source: nextSource,
      second: clampedPlayhead,
    })
  }, [
    clampedPlayhead,
    importedVideoDuration,
    isPlaying,
    previewPlaybackSource,
    resetPlaybackOrchestration,
    setPlaybackAnchor,
    shouldUseVideoPlayback,
    startPreviewPlayback,
    videoSyncOffsetSeconds,
  ])

  // Timeline clock - advances the store playhead from RAF when the video element is not the active clock.
  useEffect(() => {
    if (!isTimelinePlaybackActive || !hasActivity) {
      return undefined
    }
    let animationFrameId = 0
    const tick = (now) => {
      const timelineSecond = getTimelinePlaybackSecond({
        anchor: playbackAnchorRef.current,
        nowMs: now,
      })
      const safeDuration = totalDurationRef.current
      if (timelineSecond >= safeDuration) {
        pausePreviewPlayback(safeDuration)
        playbackAnchorRef.current = createPlaybackAnchor({
          source: 'video',
          second: safeDuration,
          nowMs: now,
        })
        previewFrameRef.current = -1
        return
      }
      const frameIndex = Math.floor(timelineSecond * effectivePreviewFps)
      if (frameIndex !== previewFrameRef.current) {
        previewFrameRef.current = frameIndex
        setSelectedSecond(clamp(frameIndex / effectivePreviewFps, 0, safeDuration))
      }
      animationFrameId = window.requestAnimationFrame(tick)
    }
    animationFrameId = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [effectivePreviewFps, hasActivity, isTimelinePlaybackActive, pausePreviewPlayback, setSelectedSecond])

  // Play command - restart from zero at the end and choose the active clock from the starting second.
  const play = useCallback(() => {
    if (!hasActivity) {
      return
    }
    const initialSecond = clampedPlayhead >= totalDuration ? 0 : clampedPlayhead
    const nextSource = resolvePlaybackSource({
      shouldUseVideoPlayback,
      playheadSecond: initialSecond,
      videoSyncOffsetSeconds,
      importedVideoDuration,
    })

    setPlaybackAnchor(nextSource, initialSecond)
    resetPlaybackOrchestration()
    startPreviewPlayback({
      source: nextSource,
      second: initialSecond,
    })
  }, [
    clampedPlayhead,
    hasActivity,
    importedVideoDuration,
    resetPlaybackOrchestration,
    setPlaybackAnchor,
    shouldUseVideoPlayback,
    startPreviewPlayback,
    totalDuration,
    videoSyncOffsetSeconds,
  ])

  // Transport commands - all non-play actions resolve to a paused playhead position.
  const pause = useCallback(() => {
    pauseAtSecond(clampedPlayhead)
  }, [clampedPlayhead, pauseAtSecond])

  const resetToStart = useCallback(() => {
    pauseAtSecond(0)
  }, [pauseAtSecond])

  const stepBySeconds = useCallback(
    (deltaSeconds) => {
      const targetSecond = clamp(clampedPlayhead + deltaSeconds, 0, totalDuration)
      pauseAtSecond(targetSecond)
    },
    [clampedPlayhead, pauseAtSecond, totalDuration],
  )

  const scrubTo = useCallback(
    (second) => {
      // Scrub preview - updates drag ownership and store preview state without leaving the scrub interaction.
      const scrubSecond = clamp(second, 0, totalDuration)
      setPlaybackAnchor('video', scrubSecond)
      setDragSecond(scrubSecond)
      previewFrameRef.current = -1
      if (previewPlaybackState !== 'scrubbing') {
        beginPreviewScrub(scrubSecond)
        return
      }
      updatePreviewScrub(scrubSecond)
    },
    [beginPreviewScrub, previewPlaybackState, setPlaybackAnchor, totalDuration, updatePreviewScrub],
  )

  const commitScrub = useCallback(
    (second) => {
      // Scrub commit - stores the final paused playhead and releases temporary drag ownership.
      const scrubSecond = clamp(second, 0, totalDuration)
      setPlaybackAnchor('video', scrubSecond)
      previewFrameRef.current = -1
      setDragSecond(null)
      commitPreviewScrub(scrubSecond)
    },
    [commitPreviewScrub, setPlaybackAnchor, totalDuration],
  )

  const jumpToEnd = useCallback(() => {
    pauseAtSecond(totalDuration)
  }, [pauseAtSecond, totalDuration])

  return {
    clampedPlayhead,
    commitScrub,
    displayedPlayhead,
    hasActivity,
    importedVideoDuration,
    importedVideoPath,
    isPlaying,
    jumpToEnd,
    pause,
    play,
    resetToStart,
    scrubTo,
    stepBySeconds,
    totalDuration,
    videoSyncOffsetSeconds,
  }
}
