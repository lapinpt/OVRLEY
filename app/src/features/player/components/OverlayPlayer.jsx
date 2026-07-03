/**
 * Renders the overlay player portion of the application interface.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
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

/**
 * Timeline playback bar with play/pause/reset transport, a ticked axis,
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
    isPlaying,
    totalDuration,
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

  const viewport = useTimelineViewport(totalDuration)

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

  return (
    <div className={hasActivity ? 'shrink-0 border-border/70 bg-black/30 px-5 py-2 backdrop-blur-sm' : 'hidden'}>
      {/* Toolbar: 3 sections */}
      <div className="flex items-center gap-4">
        {/* Left: placeholder for zoom controls */}
        <div className="w-24" />

        {/* Center: transport controls */}
        <div className="flex items-center gap-1.5 rounded-2xl border border-border/70 p-1 shadow-sm">
          <SimpleTooltip side="top" content="Play live preview">
            <Button
              type="button"
              size="icon-sm"
              variant={isPlaying ? 'secondary' : 'default'}
              className="rounded-xl"
              disabled={!hasActivity || isPlaying}
              onClick={handlePlay}
            >
              <Play className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip side="top" content="Pause playback">
            <Button type="button" size="icon-sm" variant="ghost" className="rounded-xl" disabled={!hasActivity || !isPlaying} onClick={handlePause}>
              <Pause className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
          <SimpleTooltip side="top" content="Reset to start">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="rounded-xl"
              disabled={!hasActivity || clampedPlayhead <= 0}
              onClick={handleReset}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </SimpleTooltip>
        </div>

        {/* Right: time display */}
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground w-30 justify-end flex pr-2">
          {formatTimelineTime(displayedPlayhead)} / {formatTimelineTime(totalDuration)}
        </span>
      </div>

      {/* Timeline body: axis + playhead overlay */}
      <div ref={containerRef} className="relative mt-2">
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
