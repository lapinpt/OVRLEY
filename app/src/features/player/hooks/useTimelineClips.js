/**
 * Builds render-ready lane models for video and activity clips.
 */

import { useCallback, useId, useMemo, useState } from 'react'
import { Video } from 'lucide-react'
import { formatTimelineTime } from '../utils/playerTiming'
import { getClipGeometry, getExportRangeHighlightGeometry } from '../utils/timelineGeometry'

const TEXT_HIDE_THRESHOLD_REM = 3
const CLIP_SOURCE_COLUMN_WIDTH = '1.5rem'
const CLIP_CONTENT_OFFSET_CLASS = 'translate-y-[0.04rem]'

function getRootRemPx() {
  if (typeof window === 'undefined') return 16
  return Number.parseFloat(window.getComputedStyle?.(document.documentElement).fontSize) || 16
}

function clampPx(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getBasename(path) {
  return path?.split(/[\\/]/).pop() ?? ''
}

/**
 * Owns clip lane view models, tooltip state, clip geometry, and export highlights.
 *
 * @param {object} options Clip timeline inputs.
 * @param {string|null} options.activityFilename Imported activity filename.
 * @param {object|null} options.activitySummary Imported activity summary metadata.
 * @param {{ fromSecond: number, toSecond: number }|null} options.exportHighlightRange Active export highlight range.
 * @param {boolean} options.hasActivity Whether the activity lane should be present.
 * @param {boolean} options.hasVideo Whether the video lane should be present.
 * @param {number|null} options.importedVideoDuration Imported video duration.
 * @param {string|null} options.importedVideoPath Imported video path.
 * @param {number} options.videoSyncOffsetSeconds Timeline second where video starts.
 * @param {number} options.viewEnd Visible viewport end second.
 * @param {number} options.viewStart Visible viewport start second.
 * @param {number} options.widthPx Measured timeline width.
 * @returns {Array<object>} Presentational lane view models.
 */
export default function useTimelineClips({
  activityFilename,
  activitySummary,
  exportHighlightRange,
  hasActivity,
  hasVideo,
  importedVideoDuration,
  importedVideoPath,
  videoSyncOffsetSeconds,
  viewEnd,
  viewStart,
  widthPx,
}) {
  // Tooltip identity/state - one hovered lane controls the out-of-mask tooltip renderer.
  const tooltipBaseId = useId()
  const [hoveredLaneId, setHoveredLaneId] = useState(null)

  // Clip events - clips show hover detail but must not begin timeline pan or scrub interactions.
  const stopClipEvent = useCallback((event) => {
    event.stopPropagation()
  }, [])

  // Lane view models - build video/activity lane inputs first, then attach geometry and handlers.
  return useMemo(() => {
    const laneInputs = []
    const activityDurationSeconds = activitySummary?.durationSeconds ?? 0

    // Video lane - starts at the sync offset so clip geometry represents real timeline placement.
    if (hasVideo) {
      laneInputs.push({
        ariaLabel: 'Video clip lane',
        durationSeconds: importedVideoDuration ?? 0,
        formatLabel: 'MP4',
        icon: Video,
        id: 'video',
        isVideo: true,
        label: getBasename(importedVideoPath),
        startSecond: videoSyncOffsetSeconds,
      })
    }

    // Activity lane - always starts at zero and uses activity metadata for label/duration.
    if (hasActivity) {
      laneInputs.push({
        ariaLabel: 'Activity clip lane',
        durationSeconds: activityDurationSeconds,
        formatLabel: activitySummary?.fileFormat?.toUpperCase() || 'DATA',
        icon: null,
        id: 'activity',
        isVideo: false,
        label: activityFilename || activitySummary?.fileName || 'Activity',
        startSecond: 0,
      })
    }

    return laneInputs.map((lane) => {
      // Clip geometry - percent styles are derived from pixel geometry so rendering stays responsive.
      const geometry = getClipGeometry({
        startSecond: lane.startSecond,
        durationSeconds: lane.durationSeconds,
        viewStart,
        viewEnd,
        widthPx,
      })
      const highlight = exportHighlightRange
        ? getExportRangeHighlightGeometry({
            startSecond: lane.startSecond,
            durationSeconds: lane.durationSeconds,
            exportFromSecond: exportHighlightRange.fromSecond,
            exportToSecond: exportHighlightRange.toSecond,
          })
        : null

      // Tooltip position - anchor to the visible portion of partially clipped lanes.
      const visibleStartPx = geometry.isVisible ? clampPx(geometry.x, 0, widthPx) : 0
      const visibleEndPx = geometry.isVisible ? clampPx(geometry.x + geometry.width, 0, widthPx) : 0
      const tooltipAnchorPx = visibleStartPx + Math.max(0, visibleEndPx - visibleStartPx) / 2
      const showTooltip = hoveredLaneId === lane.id && Boolean(lane.label)

      // Presentational lane model - TimelineLane renders these values without owning calculations.
      return {
        ...lane,
        clipClassName: lane.isVideo ? 'bg-accent/70' : 'bg-primary/80',
        clipContentClassName: CLIP_CONTENT_OFFSET_CLASS,
        clipProps: {
          onClick: stopClipEvent,
          onDoubleClick: stopClipEvent,
          onMouseEnter: () => setHoveredLaneId(lane.id),
          onMouseLeave: () => setHoveredLaneId(null),
          onPointerDown: stopClipEvent,
          onPointerUp: stopClipEvent,
        },
        clipStyle: {
          left: widthPx > 0 ? `${(geometry.x / widthPx) * 100}%` : '0%',
          width: widthPx > 0 ? `${(geometry.width / widthPx) * 100}%` : '0%',
        },
        durationLabel: formatTimelineTime(lane.durationSeconds),
        highlightStyle:
          highlight?.isVisible === true
            ? {
                left: `${highlight.leftPercent}%`,
                width: `${highlight.widthPercent}%`,
              }
            : null,
        isVisible: geometry.isVisible,
        showText: geometry.isVisible && geometry.width >= TEXT_HIDE_THRESHOLD_REM * getRootRemPx(),
        sourceColumnWidth: CLIP_SOURCE_COLUMN_WIDTH,
        textClassName: lane.isVideo ? 'text-accent-foreground' : 'text-background',
        tooltip: {
          id: `${tooltipBaseId}-${lane.id}`,
          isVisible: showTooltip,
          style: {
            left: widthPx > 0 ? `${(tooltipAnchorPx / widthPx) * 100}%` : '50%',
          },
        },
      }
    })
  }, [
    activityFilename,
    activitySummary,
    exportHighlightRange,
    hasActivity,
    hasVideo,
    hoveredLaneId,
    importedVideoDuration,
    importedVideoPath,
    stopClipEvent,
    tooltipBaseId,
    videoSyncOffsetSeconds,
    viewEnd,
    viewStart,
    widthPx,
  ])
}
