import { useCallback, useId, useState } from 'react'
import { Video } from 'lucide-react'
import { formatTimelineTime, getClipGeometry, getExportRangeHighlightGeometry } from '../utils/playerTimeline'

const TEXT_HIDE_THRESHOLD_REM = 3
const CLIP_CONTENT_OFFSET_CLASS = 'translate-y-[0.04rem]'
const CLIP_SOURCE_COLUMN_WIDTH = '1.5rem'

function getRootRemPx() {
  if (typeof window === 'undefined') return 16
  return Number.parseFloat(window.getComputedStyle?.(document.documentElement).fontSize) || 16
}

function clampPx(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

/**
 * Renders a single clip lane - a colored rectangle positioned by its timing data.
 * Clip rectangles can be hovered for details, but they do not start seek or pan
 * interactions.
 *
 * @param {{
 *   clipStart: number,
 *   clipDuration: number,
 *   label: string,
 *   formatLabel: string,
 *   durationSeconds: number,
 *   viewStart: number,
 *   viewEnd: number,
 *   widthPx: number,
 *   isVideo: boolean,
 *   exportHighlightRange?: { fromSecond: number, toSecond: number } | null,
 * }} props
 */
export default function TimelineLane({
  clipStart,
  clipDuration,
  label,
  formatLabel,
  durationSeconds,
  viewStart,
  viewEnd,
  widthPx,
  isVideo,
  exportHighlightRange = null,
}) {
  const geometry = getClipGeometry({ clipStart, clipDuration, viewStart, viewEnd, widthPx })
  const highlight = exportHighlightRange
    ? getExportRangeHighlightGeometry({
        clipStart,
        clipDuration,
        exportFromSecond: exportHighlightRange.fromSecond,
        exportToSecond: exportHighlightRange.toSecond,
      })
    : null
  const tooltipId = useId()
  const [showTooltip, setShowTooltip] = useState(false)
  const formattedDuration = formatTimelineTime(durationSeconds)

  const showText = geometry.isVisible && geometry.width >= TEXT_HIDE_THRESHOLD_REM * getRootRemPx()
  const leftPct = widthPx > 0 ? `${(geometry.x / widthPx) * 100}%` : '0%'
  const widthPct = widthPx > 0 ? `${(geometry.width / widthPx) * 100}%` : '0%'
  const visibleStartPx = geometry.isVisible ? clampPx(geometry.x, 0, widthPx) : 0
  const visibleEndPx = geometry.isVisible ? clampPx(geometry.x + geometry.width, 0, widthPx) : 0
  const tooltipAnchorPx = visibleStartPx + Math.max(0, visibleEndPx - visibleStartPx) / 2
  const tooltipLeftPct = widthPx > 0 ? `${(tooltipAnchorPx / widthPx) * 100}%` : '50%'

  const stopClipEvent = useCallback((event) => {
    event.stopPropagation()
  }, [])

  return (
    <div aria-label={isVideo ? 'Video clip lane' : 'Activity clip lane'} className={`relative w-full ${isVideo ? 'h-6 border-b-0' : 'h-6'}`}>
      <div data-testid="timeline-lane-clip-mask space-y-4" className="absolute inset-0 overflow-hidden">
        {geometry.isVisible && (
          <div
            aria-describedby={showTooltip ? tooltipId : undefined}
            aria-label={label || 'clip'}
            className={`absolute h-full cursor-default overflow-hidden ${isVideo ? 'bg-accent/70' : 'bg-primary/80'}`}
            style={{ left: leftPct, width: widthPct }}
            onClick={stopClipEvent}
            onDoubleClick={stopClipEvent}
            onMouseEnter={() => label && setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onPointerDown={stopClipEvent}
            onPointerUp={stopClipEvent}
          >
            {highlight?.isVisible && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 bg-success/20"
                style={{ left: `${highlight.leftPercent}%`, width: `${highlight.widthPercent}%` }}
              />
            )}
            {showText && (
              <div
                className={`relative grid h-full items-center gap-3 overflow-hidden whitespace-nowrap px-2.5 text-[0.7rem] font-bold uppercase leading-none ${isVideo ? 'text-accent-foreground' : 'text-background'}`}
                style={{ gridTemplateColumns: `${CLIP_SOURCE_COLUMN_WIDTH} minmax(0, 1fr) auto` }}
              >
                <span className={`flex min-w-0 items-center justify-center ${CLIP_CONTENT_OFFSET_CLASS}`}>
                  {isVideo ? (
                    <Video className="h-5 w-5 shrink-0 mr-0.5" strokeWidth={3} aria-hidden="true" />
                  ) : (
                    <span className="block max-w-full truncate text-[0.9rem] font-black leading-none">{formatLabel}</span>
                  )}
                </span>
                <span className={`min-w-0 truncate leading-none ${CLIP_CONTENT_OFFSET_CLASS}`}>{label}</span>
                <span className={`shrink-0 pl-1 tabular-nums leading-none ${CLIP_CONTENT_OFFSET_CLASS}`}>{formattedDuration}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {showTooltip && label && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-1000 mb-2 min-w-40 -translate-x-1/2 whitespace-nowrap rounded border border-border/70 bg-surface-tooltip px-2.5 py-1.5 text-left text-xs text-foreground shadow-2xl"
          style={{ left: tooltipLeftPct }}
        >
          <div className="text-[0.72rem] font-semibold leading-snug">{label}</div>
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-border/40 pt-1 text-[0.65rem] text-muted-foreground">
            <span className="font-medium">Duration</span>
            <span className="tabular-nums text-foreground">{formattedDuration}</span>
          </div>
          <div className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-4 border-transparent border-t-surface-tooltip" />
        </div>
      )}
    </div>
  )
}
