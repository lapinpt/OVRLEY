/**
 * Renders the overlay player portion of the application interface.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import useStore from '@/store/useStore'
import { Button } from '@/components/ui/button'
import { SimpleTooltip } from '@/components/ui/simple-tooltip'
import usePlaybackEngine from '../hooks/usePlaybackEngine'
import usePlayerKeyboard from '../hooks/usePlayerKeyboard'
import useTimelineViewport from '../hooks/useTimelineViewport'
import { computeTimelineTicks, formatTimelineTime } from '../utils/playerTimeline'
import TimelineAxis from './TimelineAxis'
import TimelinePlayhead from './TimelinePlayhead'

const ZOOM_TAB_ALL = 'all'
const ZOOM_TAB_VIDEO = 'video'
const ZOOM_TAB_ACTIVITY = 'activity'

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

  const { viewport, zoomBy, fitAll, fitVideo, fitActivity, resetView } = useTimelineViewport({
    totalDuration,
    videoSyncOffsetSeconds,
    importedVideoDuration,
    activityDurationSeconds,
    fallbackDurationSeconds: playerStore.fallbackDurationSeconds,
  })

  const [activeTab, setActiveTab] = useState(ZOOM_TAB_ALL)

  const handleTabChange = useCallback(
    (tab) => {
      setActiveTab(tab)
    },
    [setActiveTab],
  )

  useEffect(() => {
    if (activeTab === ZOOM_TAB_ALL) {
      fitAll()
      return
    }

    if (activeTab === ZOOM_TAB_VIDEO) {
      if (!hasVideo) {
        setActiveTab(ZOOM_TAB_ALL)
        fitAll()
        return
      }

      fitVideo()
      return
    }

    if (activeTab === ZOOM_TAB_ACTIVITY) {
      if (!hasActivityData) {
        setActiveTab(ZOOM_TAB_ALL)
        fitAll()
        return
      }

      fitActivity()
    }
  }, [activeTab, fitActivity, fitAll, fitVideo, hasActivityData, hasVideo])

  const handleZoomOut = useCallback(() => {
    zoomBy(-1, clampedPlayhead)
  }, [clampedPlayhead, zoomBy])

  const handleZoomIn = useCallback(() => {
    zoomBy(1, clampedPlayhead)
  }, [clampedPlayhead, zoomBy])

  const containerRef = useRef(null)
  const [widthPx, setWidthPx] = useState(0)

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
    },
    [handleTimelineCommit],
  )

  const handleRewindToEnd = useCallback(() => {
    handleTimelineChange([totalDuration])
    handleTimelineCommit([totalDuration])
  }, [handleTimelineChange, handleTimelineCommit, totalDuration])

  return (
    <div className={hasActivity ? 'shrink-0 border-border/70 bg-black/30 px-5 py-2 backdrop-blur-sm' : 'hidden'}>
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
              onClick={() => {
                resetView()
                setActiveTab(ZOOM_TAB_ALL)
              }}
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </SimpleTooltip>
          <div className="ml-1 flex items-center gap-0.5 rounded-md border border-border/50 p-0.5 uppercase">
            <Button
              type="button"
              size="toolbar-tab"
              variant="toolbar"
              aria-pressed={activeTab === ZOOM_TAB_ALL}
              onClick={() => handleTabChange(ZOOM_TAB_ALL)}
            >
              All
            </Button>
            {hasVideo && (
              <Button
                type="button"
                size="toolbar-tab"
                variant="toolbar"
                aria-pressed={activeTab === ZOOM_TAB_VIDEO}
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
                aria-pressed={activeTab === ZOOM_TAB_ACTIVITY}
                onClick={() => handleTabChange(ZOOM_TAB_ACTIVITY)}
              >
                Activity
              </Button>
            )}
          </div>
        </div>

        {/* Center: 5-button NLE transport */}
        <div className="flex items-center gap-1 rounded-md border border-border/70 p-0.5 shadow-sm">
          <SimpleTooltip side="top" content="Rewind to start">
            <Button type="button" aria-label="Rewind to start" size="toolbar-icon" variant="toolbar" disabled={!hasActivity} onClick={handleReset}>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip side="top" content="Step back">
            <Button
              type="button"
              aria-label="Step back"
              size="toolbar-icon"
              variant="toolbar"
              disabled={!hasActivity}
              onClick={() => handleStepByDirection(-1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip side="top" content={isPlaying ? 'Pause' : 'Play'}>
            <Button
              type="button"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              size="toolbar-icon"
              variant={isPlaying ? 'secondary' : 'default'}
              disabled={!hasActivity}
              onClick={isPlaying ? handlePause : handlePlay}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
          </SimpleTooltip>
          <SimpleTooltip side="top" content="Step forward">
            <Button
              type="button"
              aria-label="Step forward"
              size="toolbar-icon"
              variant="toolbar"
              disabled={!hasActivity}
              onClick={() => handleStepByDirection(1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip side="top" content="Rewind to end">
            <Button
              type="button"
              aria-label="Rewind to end"
              size="toolbar-icon"
              variant="toolbar"
              disabled={!hasActivity}
              onClick={handleRewindToEnd}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </div>

        {/* Right: time display */}
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground w-30 justify-end flex pr-2">
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
        />
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
          />
        </div>
      </div>
    </div>
  )
}
