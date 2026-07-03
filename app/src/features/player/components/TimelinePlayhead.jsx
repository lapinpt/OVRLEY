import { useCallback, useRef } from 'react'
import useTimelineDrag from '../hooks/useTimelineDrag'
import { pointerToSecond } from '../utils/playerTimeline'

/**
 * Vertical playhead line with a triangle handle. Drags to scrub.
 *
 * @param {{ second: number, viewStart: number, viewEnd: number, totalDuration: number, widthPx: number, onScrubStart: function, onScrubMove: function, onScrubEnd: function, onScrubCancel?: function }} props
 */
export default function TimelinePlayhead({
  second,
  viewStart,
  viewEnd,
  totalDuration,
  widthPx,
  onScrubStart,
  onScrubMove,
  onScrubEnd,
  onScrubCancel,
}) {
  const containerRef = useRef(null)

  const getSecond = useCallback(
    (event) => {
      if (!containerRef.current) return undefined
      const rect = containerRef.current.getBoundingClientRect()
      return pointerToSecond(event.clientX, rect, viewStart, viewEnd, widthPx, totalDuration)
    },
    [viewStart, viewEnd, widthPx, totalDuration],
  )

  const dragHandlers = useTimelineDrag({
    getValue: getSecond,
    onDragStart: onScrubStart,
    onDragMove: onScrubMove,
    onDragEnd: onScrubEnd,
    onDragCancel: onScrubCancel,
    stopPropagation: true,
  })

  const span = viewEnd - viewStart
  const left = span > 0 && widthPx > 0 ? `${Math.min(100, Math.max(0, ((second - viewStart) / span) * 100))}%` : 0

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      {/* Vertical line */}
      <div className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-primary" style={{ left }} />
      {/* Triangle handle */}
      <div className="pointer-events-auto absolute top-0 -translate-x-1/2 cursor-grab" style={{ left }} {...dragHandlers}>
        <svg width="12" height="10" viewBox="0 0 12 10" className="fill-primary">
          <polygon points="0,0 12,0 6,10" />
        </svg>
      </div>
    </div>
  )
}
