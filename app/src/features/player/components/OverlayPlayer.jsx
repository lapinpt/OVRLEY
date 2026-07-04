/**
 * Renders the overlay player portion of the application interface.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Rewind, StepBack, StepForward, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import useStore from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { SimpleTooltip } from '@/components/ui/simple-tooltip'
import { timeToSeconds } from '@/features/overlay-editor/utils/exportRange'
import usePlaybackEngine from '../hooks/usePlaybackEngine'
import usePlayerKeyboard from '../hooks/usePlayerKeyboard'
import useTimelineViewport from '../hooks/useTimelineViewport'
import { clamp, computeTimelineTicks, fitRangeToViewport, formatTimelineTime } from '../utils/playerTimeline'
import TimelineAxis from './TimelineAxis'
import TimelineExportMarkers from './TimelineExportMarkers'
import TimelineLane from './TimelineLane'
import TimelinePanSurface from './TimelinePanSurface'
import TimelinePlayhead from './TimelinePlayhead'

const ZOOM_TAB_ALL = 'all'
const ZOOM_TAB_VIDEO = 'video'
const ZOOM_TAB_ACTIVITY = 'activity'
const VIEWPORT_MATCH_EPSILON_SECONDS = 0.001

function rangesMatch(a, b) {
  if (!a || !b) return false
  return Math.abs(a.viewStart - b.viewStart) <= VIEWPORT_MATCH_EPSILON_SECONDS && Math.abs(a.viewEnd - b.viewEnd) <= VIEWPORT_MATCH_EPSILON_SECONDS
}

function useExportHighlightRange(totalDuration) {
  const exportRange = useStore((state) => state.exportRange)

  return useMemo(() => {
    if (exportRange?.type !== 'custom') return null

    return {
      fromSecond: clamp(timeToSeconds(exportRange.fromTime), 0, totalDuration),
      toSecond: clamp(timeToSeconds(exportRange.toTime), 0, totalDuration),
    }
  }, [exportRange, totalDuration])
}

function TimelineLaneWithExportHighlight({ totalDuration, exportPreviewRange, ...props }) {
  const exportHighlightRange = useExportHighlightRange(totalDuration)
  return <TimelineLane {...props} exportHighlightRange={exportPreviewRange ?? exportHighlightRange} />
}

/**
 * Timeline playback bar with zoom controls, 5-button NLE transport, a ticked axis,
 * and a draggable playhead. Composes store selectors, playback engine,
 * keyboard shortcuts, and the viewport hook directly.
 *
 * @param {{ backgroundMode: string }} props
 */
export default function OverlayPlayer({ backgroundMode }) {
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

  const playback = usePlaybackEngine({ ...playerStore, backgroundMode })

  const {
    clampedPlayhead,
    displayedPlayhead,
    handlePause,
    handlePlay,
    handleReset,
    handleTimelineChange,
    handleTimelineCommit,
    handleStepByDirection,
    hasActivity,
    importedVideoDuration,
    importedVideoPath,
    isPlaying,
    totalDuration,
    videoSyncOffsetSeconds,
  } = playback

  usePlayerKeyboard({
    clampedPlayhead,
    handlePause,
    handlePlay,
    handleStepByDirection,
    hasActivity,
    isPlaying,
    totalDuration,
  })

  const hasVideo = Boolean(importedVideoPath)
  const hasActivityData = Boolean(playerStore.activitySummary)
  const activityDurationSeconds = playerStore.activitySummary?.durationSeconds ?? 0
  const [isTimelineDragging, setIsTimelineDragging] = useState(false)
  const [exportPreviewRange, setExportPreviewRange] = useState(null)
  const containerRef = useRef(null)
  const [widthPx, setWidthPx] = useState(0)

  const { viewport, zoomBy, fitAll, fitVideo, fitActivity, resetView, panBy } = useTimelineViewport({
    totalDuration,
    videoSyncOffsetSeconds,
    importedVideoDuration,
    activityDurationSeconds,
    fallbackDurationSeconds: playerStore.fallbackDurationSeconds,
    widthPx,
    isPlaying,
    playheadSecond: clampedPlayhead,
    isDragging: isTimelineDragging,
  })

  const [activeTab, setActiveTab] = useState(ZOOM_TAB_ALL)

  const handleTabChange = useCallback(
    (tab) => {
      setActiveTab(tab)

      if (tab === ZOOM_TAB_ALL) {
        fitAll()
        return
      }

      if (tab === ZOOM_TAB_VIDEO) {
        fitVideo()
        return
      }

      if (tab === ZOOM_TAB_ACTIVITY) {
        fitActivity()
      }
    },
    [fitActivity, fitAll, fitVideo],
  )

  useEffect(() => {
    if ((activeTab === ZOOM_TAB_VIDEO && !hasVideo) || (activeTab === ZOOM_TAB_ACTIVITY && !hasActivityData)) {
      setActiveTab(ZOOM_TAB_ALL)
      fitAll()
    }
  }, [activeTab, fitAll, hasActivityData, hasVideo])

  const handleZoomOut = useCallback(() => {
    zoomBy(-1, clampedPlayhead)
  }, [clampedPlayhead, zoomBy])

  const handleZoomIn = useCallback(() => {
    zoomBy(1, clampedPlayhead)
  }, [clampedPlayhead, zoomBy])

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidthPx(entry.contentRect.width)
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const ticks = computeTimelineTicks({ viewStart: viewport.viewStart, viewEnd: viewport.viewEnd, widthPx })
  const allViewport = useMemo(() => ({ viewStart: 0, viewEnd: totalDuration }), [totalDuration])
  const videoViewport = useMemo(() => {
    if (!hasVideo) return null
    const start = Math.max(0, Number(videoSyncOffsetSeconds) || 0)
    const end = start + (Number(importedVideoDuration) || 0)
    return fitRangeToViewport({ rangeStart: start, rangeEnd: end, totalDuration })
  }, [hasVideo, importedVideoDuration, totalDuration, videoSyncOffsetSeconds])
  const activityViewport = useMemo(() => {
    if (!hasActivityData) return null
    const duration = activityDurationSeconds > 0 ? activityDurationSeconds : playerStore.fallbackDurationSeconds
    return fitRangeToViewport({ rangeStart: 0, rangeEnd: duration, totalDuration })
  }, [activityDurationSeconds, hasActivityData, playerStore.fallbackDurationSeconds, totalDuration])

  const isFullTimelineVisible = rangesMatch(viewport, allViewport)
  const displayedTab = isFullTimelineVisible
    ? ZOOM_TAB_ALL
    : rangesMatch(viewport, videoViewport)
      ? ZOOM_TAB_VIDEO
      : rangesMatch(viewport, activityViewport)
        ? ZOOM_TAB_ACTIVITY
        : null
  const handleWheel = useCallback(
    (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const pivot = viewport.viewStart + ((e.clientX - rect.left) / rect.width) * (viewport.viewEnd - viewport.viewStart)
      zoomBy(e.deltaY < 0 ? 1 : -1, pivot)
    },
    [viewport, zoomBy],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  const scrubStart = useCallback(
    (second) => {
      setIsTimelineDragging(true)
      handleTimelineChange([second])
    },
    [handleTimelineChange],
  )

  const scrubMove = useCallback(
    (second) => {
      handleTimelineChange([second])
    },
    [handleTimelineChange],
  )

  const scrubEnd = useCallback(
    (second) => {
      handleTimelineCommit([second])
      setIsTimelineDragging(false)
    },
    [handleTimelineCommit],
  )

  const endTimelineDrag = useCallback(() => {
    setIsTimelineDragging(false)
  }, [])

  const startTimelinePan = useCallback(() => {
    setIsTimelineDragging(true)
  }, [])

  const handleRewindToEnd = useCallback(() => {
    handleTimelineChange([totalDuration])
    handleTimelineCommit([totalDuration])
  }, [handleTimelineChange, handleTimelineCommit, totalDuration])

  const videoBasename = hasVideo ? (importedVideoPath?.split(/[\\/]/).pop() ?? '') : ''
  const activityLabel = playerStore.activityFilename || playerStore.activitySummary?.fileName || 'Activity'
  const activityFormatLabel = playerStore.activitySummary?.fileFormat?.toUpperCase() || 'DATA'

  return (
    <div className={hasActivity || hasVideo ? 'shrink-0 border-border/70 bg-black/30 px-8 py-2 backdrop-blur-sm' : 'hidden'}>
      {/* Toolbar: 3 sections */}
      <div className="flex w-full items-center justify-between gap-4">
        {/* Left: zoom controls + auto-zoom tabs */}
        <div className="flex items-center gap-1">
          <SimpleTooltip side="top" content="Zoom out">
            <Button type="button" aria-label="Zoom out" size="toolbar-icon" variant="toolbar" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip side="top" content="Zoom in">
            <Button type="button" aria-label="Zoom in" size="toolbar-icon" variant="toolbar" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip side="top" content="Reset view">
            <Button
              type="button"
              aria-label="Reset view"
              size="toolbar-icon"
              variant="toolbar"
              disabled={isFullTimelineVisible}
              onClick={() => {
                resetView()
                setActiveTab(ZOOM_TAB_ALL)
              }}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </SimpleTooltip>
          <div className="ml-1 flex items-center gap-0.5 rounded-sm border border-border/50 p-0.5 uppercase">
            <Button
              type="button"
              size="toolbar-tab"
              variant="toolbar"
              aria-pressed={displayedTab === ZOOM_TAB_ALL}
              onClick={() => handleTabChange(ZOOM_TAB_ALL)}
            >
              All
            </Button>
            {hasVideo && (
              <Button
                type="button"
                size="toolbar-tab"
                variant="toolbar"
                aria-pressed={displayedTab === ZOOM_TAB_VIDEO}
                onClick={() => handleTabChange(ZOOM_TAB_VIDEO)}
              >
                Video
              </Button>
            )}
            {hasActivityData && (
              <Button
                type="button"
                size="toolbar-tab"
                variant="toolbar"
                aria-pressed={displayedTab === ZOOM_TAB_ACTIVITY}
                onClick={() => handleTabChange(ZOOM_TAB_ACTIVITY)}
              >
                Activity
              </Button>
            )}
          </div>
        </div>

        {/* Center: 5-button NLE transport */}
        <div className="flex items-center gap-1 rounded-md border border-border/30 p-0.5 shadow-sm">
          <Button type="button" aria-label="Rewind to start" size="toolbar-icon" variant="toolbar" disabled={!hasActivity} onClick={handleReset}>
            <Rewind className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            aria-label="Step back"
            size="toolbar-icon"
            variant="toolbar"
            disabled={!hasActivity}
            onClick={() => handleStepByDirection(-1)}
          >
            <StepBack className="h-3.5 w-3.5" />
          </Button>

          <Button
            type="button"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            size="toolbar-icon"
            variant={isPlaying ? 'secondary' : 'default'}
            disabled={!hasActivity}
            onClick={isPlaying ? handlePause : handlePlay}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" strokeWidth={2} />}
          </Button>

          <Button
            type="button"
            aria-label="Step forward"
            size="toolbar-icon"
            variant="toolbar"
            disabled={!hasActivity}
            onClick={() => handleStepByDirection(1)}
          >
            <StepForward className="h-3.5 w-3.5" />
          </Button>

          <Button type="button" aria-label="Rewind to end" size="toolbar-icon" variant="toolbar" disabled={!hasActivity} onClick={handleRewindToEnd}>
            <Rewind className="h-3.5 w-3.5 rotate-180" />
          </Button>
        </div>

        {/* Right: time display */}
        <span className="flex w-30 shrink-0 justify-end text-xs font-medium tabular-nums text-muted-foreground">
          {formatTimelineTime(displayedPlayhead)} / {formatTimelineTime(totalDuration)}
        </span>
      </div>

      {/* Timeline body: axis + playhead overlay */}
      <div ref={containerRef} className="relative mt-2" role="group" aria-label="Timeline">
        <TimelineAxis
          viewStart={viewport.viewStart}
          viewEnd={viewport.viewEnd}
          totalDuration={totalDuration}
          widthPx={widthPx}
          ticks={ticks}
          onScrubStart={scrubStart}
          onScrubMove={scrubMove}
          onScrubEnd={scrubEnd}
          onScrubCancel={endTimelineDrag}
        />
        <TimelinePanSurface
          viewStart={viewport.viewStart}
          viewEnd={viewport.viewEnd}
          widthPx={widthPx}
          onPanBy={panBy}
          onPanStart={startTimelinePan}
          onPanEnd={endTimelineDrag}
        >
          {hasVideo && (
            <TimelineLaneWithExportHighlight
              clipStart={videoSyncOffsetSeconds}
              clipDuration={importedVideoDuration ?? 0}
              label={videoBasename}
              formatLabel="MP4"
              durationSeconds={importedVideoDuration ?? 0}
              viewStart={viewport.viewStart}
              viewEnd={viewport.viewEnd}
              widthPx={widthPx}
              isVideo
              totalDuration={totalDuration}
              exportPreviewRange={exportPreviewRange}
            />
          )}
          {hasActivity && (
            <TimelineLaneWithExportHighlight
              clipStart={0}
              clipDuration={activityDurationSeconds}
              label={activityLabel}
              formatLabel={activityFormatLabel}
              durationSeconds={activityDurationSeconds}
              viewStart={viewport.viewStart}
              viewEnd={viewport.viewEnd}
              widthPx={widthPx}
              isVideo={false}
              totalDuration={totalDuration}
              exportPreviewRange={exportPreviewRange}
            />
          )}
        </TimelinePanSurface>
        <div className="pointer-events-none absolute inset-0">
          <TimelinePlayhead
            second={displayedPlayhead}
            viewStart={viewport.viewStart}
            viewEnd={viewport.viewEnd}
            totalDuration={totalDuration}
            widthPx={widthPx}
            onScrubStart={scrubStart}
            onScrubMove={scrubMove}
            onScrubEnd={scrubEnd}
            onScrubCancel={endTimelineDrag}
          />
          <TimelineExportMarkers
            viewStart={viewport.viewStart}
            viewEnd={viewport.viewEnd}
            totalDuration={totalDuration}
            widthPx={widthPx}
            onPreviewRangeChange={setExportPreviewRange}
          />
        </div>
      </div>
    </div>
  )
}
