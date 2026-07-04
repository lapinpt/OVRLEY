/**
 * Top-level player orchestration hook for the presentational overlay player components.
 */

import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isInteractiveElement } from '@/lib/utils'
import useStore from '@/store/useStore'
import { formatTimelineTime } from '../utils/playerTiming'
import { roundToDevicePixel, secondsToViewPx } from '../utils/timelineGeometry'
import useExportRangeTimeline from './useExportRangeTimeline'
import usePlaybackEngine from './usePlaybackEngine'
import useTimelineClips from './useTimelineClips'
import useTimelineGestures from './useTimelineGestures'
import useTimelineViewport from './useTimelineViewport'

function getDevicePixelRatio() {
  if (typeof window === 'undefined') return 1
  return window.devicePixelRatio || 1
}

function getMarkerClassName(marker) {
  return `mt-1 h-4 w-2.5 bg-success/10 ${
    marker === 'from' ? 'rounded-l-sm border-b-2 border-l-2 border-t-2' : 'rounded-r-sm border-b-2 border-r-2 border-t-2'
  } border-success`
}

/**
 * Composes store selection, playback, viewport, export range, gestures, clips, and keyboard commands.
 *
 * @param {{ backgroundMode: string }} options Overlay player inputs.
 * @param {string} options.backgroundMode Active preview background mode.
 * @returns {object} Presentational view model for the overlay player.
 */
export default function useOverlayPlayer({ backgroundMode }) {
  // Store selector - gathers the entire player-facing store contract in one subscription.
  const playerStore = useStore(
    useShallow((state) => ({
      activityFilename: state.activityFilename,
      activitySummary: state.activitySummary,
      beginPreviewScrub: state.beginPreviewScrub,
      commitPreviewScrub: state.commitPreviewScrub,
      fallbackDurationSeconds: state.fallbackDurationSeconds,
      importedVideoDuration: state.importedVideoDuration,
      importedVideoPath: state.importedVideoPath,
      pausePreviewPlayback: state.pausePreviewPlayback,
      previewPlaybackSource: state.previewPlaybackSource,
      previewPlaybackState: state.previewPlaybackState,
      sceneFps: state.config?.scene?.fps ?? 30,
      selectedSecond: state.selectedSecond,
      setSelectedSecond: state.setSelectedSecond,
      startPreviewPlayback: state.startPreviewPlayback,
      updatePreviewScrub: state.updatePreviewScrub,
      updateRate: state.updateRate,
      videoSyncOffsetSeconds: state.videoSyncOffsetSeconds,
    })),
  )

  // Durable domains - each hook owns behavior for one player concern, while this hook wires them together.
  const playback = usePlaybackEngine({ ...playerStore, backgroundMode })
  const exportTimeline = useExportRangeTimeline({ totalDuration: playback.totalDuration })
  const gestures = useTimelineGestures({
    cancelMarkerPreview: exportTimeline.cancelMarkerPreview,
    commitMarker: exportTimeline.commitMarker,
    commitScrub: playback.commitScrub,
    previewMarker: exportTimeline.previewMarker,
    scrubTo: playback.scrubTo,
  })

  // Media flags - downstream hooks need explicit availability booleans, not inferred path/summary checks.
  const hasVideo = Boolean(playback.importedVideoPath)
  const hasActivityData = Boolean(playerStore.activitySummary)
  const activityDurationSeconds = playerStore.activitySummary?.durationSeconds ?? 0

  // Viewport domain - owns measurement, fit targets, ticks, zoom, pan, and playback follow behavior.
  const viewport = useTimelineViewport({
    activityDurationSeconds,
    fallbackDurationSeconds: playerStore.fallbackDurationSeconds,
    hasActivityData,
    hasVideo,
    importedVideoDuration: playback.importedVideoDuration,
    isDragging: gestures.isTimelineDragging,
    isPlaying: playback.isPlaying,
    playheadSecond: playback.clampedPlayhead,
    totalDuration: playback.totalDuration,
    videoSyncOffsetSeconds: playback.videoSyncOffsetSeconds,
  })

  // Gesture metrics sync - pointer math uses the latest measured element and viewport without re-rendering on every move.
  useEffect(() => {
    gestures.updateTimelineMetrics({
      containerElement: viewport.containerElement,
      panBy: viewport.panBy,
      totalDuration: playback.totalDuration,
      viewEnd: viewport.viewport.viewEnd,
      viewStart: viewport.viewport.viewStart,
      widthPx: viewport.widthPx,
    })
  }, [
    gestures,
    playback.totalDuration,
    viewport.containerElement,
    viewport.containerRef,
    viewport.panBy,
    viewport.viewport.viewEnd,
    viewport.viewport.viewStart,
    viewport.widthPx,
  ])

  // Keyboard shortcuts - global commands route through the same playback API as toolbar buttons.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.repeat || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || !playback.hasActivity) {
        return
      }

      if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
        if (isInteractiveElement(event.target)) return
        event.preventDefault()
        playback.stepBySeconds(event.code === 'ArrowRight' ? 1 : -1)
        return
      }

      if (event.code !== 'Space' || isInteractiveElement(event.target)) {
        return
      }

      event.preventDefault()
      if (playback.isPlaying) {
        playback.pause()
        return
      }

      playback.play()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playback])

  // Lane models - clip geometry and tooltip state are prepared before presentational rendering.
  const lanes = useTimelineClips({
    activityFilename: playerStore.activityFilename,
    activitySummary: playerStore.activitySummary,
    exportHighlightRange: exportTimeline.highlightRange,
    hasActivity: playback.hasActivity,
    hasVideo,
    importedVideoDuration: playback.importedVideoDuration,
    importedVideoPath: playback.importedVideoPath,
    videoSyncOffsetSeconds: playback.videoSyncOffsetSeconds,
    viewEnd: viewport.viewport.viewEnd,
    viewStart: viewport.viewport.viewStart,
    widthPx: viewport.widthPx,
  })

  // Playhead geometry - converts the displayed playhead second into a stable pixel position for the surface.
  const pixelRatio = getDevicePixelRatio()
  const playheadLeft = roundToDevicePixel(
    secondsToViewPx({
      second: playback.displayedPlayhead,
      viewStart: viewport.viewport.viewStart,
      viewEnd: viewport.viewport.viewEnd,
      widthPx: viewport.widthPx,
    }),
    pixelRatio,
  )

  // Export marker models - hide markers outside the viewport and attach gesture props to visible handles.
  const exportMarkers = useMemo(
    () =>
      exportTimeline.markers
        .map((marker) => {
          const isVisible =
            marker.second >= viewport.viewport.viewStart &&
            marker.second <= viewport.viewport.viewEnd &&
            viewport.widthPx > 0 &&
            viewport.viewport.viewEnd > viewport.viewport.viewStart

          if (!isVisible) return null

          const left = roundToDevicePixel(
            secondsToViewPx({
              second: marker.second,
              viewStart: viewport.viewport.viewStart,
              viewEnd: viewport.viewport.viewEnd,
              widthPx: viewport.widthPx,
            }),
            pixelRatio,
          )

          return {
            ...marker,
            handleClassName: getMarkerClassName(marker.marker),
            lineStyle: { left },
            markerProps: gestures.getExportMarkerProps(marker.marker),
            style: { left },
          }
        })
        .filter(Boolean),
    [exportTimeline.markers, gestures, pixelRatio, viewport.viewport.viewEnd, viewport.viewport.viewStart, viewport.widthPx],
  )

  // Fit target commands - presentational tabs only need active state, labels, and a command callback.
  const fitTargets = useMemo(
    () =>
      viewport.fitTargets.map((target) => ({
        id: target.id,
        isActive: viewport.displayedFitTargetId === target.id,
        label: target.label,
        onSelect: () => viewport.fitTarget(target.id),
      })),
    [viewport],
  )

  // View model - components receive only render-ready state and callbacks, not store or calculation details.
  return {
    isVisible: playback.hasActivity || hasVideo,
    timeline: {
      axisProps: gestures.axisProps,
      containerProps: {
        onWheel: viewport.handleWheel,
        ref: viewport.containerRef,
      },
      exportMarkers,
      lanes,
      panSurfaceProps: gestures.panSurfaceProps,
      playhead: {
        handleProps: gestures.playheadProps,
        lineStyle: { left: playheadLeft },
        style: { left: playheadLeft },
      },
      ticks: viewport.ticks,
      viewport: viewport.viewport,
      widthPx: viewport.widthPx,
    },
    toolbar: {
      fitTargets,
      resetView: {
        disabled: viewport.isFullTimelineVisible,
        onClick: viewport.resetView,
      },
      timeLabel: {
        current: formatTimelineTime(playback.displayedPlayhead),
        total: formatTimelineTime(playback.totalDuration),
      },
      transport: {
        isDisabled: !playback.hasActivity,
        isPlaying: playback.isPlaying,
        jumpToEnd: playback.jumpToEnd,
        pause: playback.pause,
        play: playback.play,
        resetToStart: playback.resetToStart,
        stepBackward: () => playback.stepBySeconds(-1),
        stepForward: () => playback.stepBySeconds(1),
      },
      zoomIn: viewport.zoomIn,
      zoomOut: viewport.zoomOut,
    },
  }
}
