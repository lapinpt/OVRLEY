import { useCallback, useRef } from 'react'
import useTimelineDrag from '../hooks/useTimelineDrag'
import { pointerToSecond } from '../utils/playerTimeline'

function roundToDevicePixel(value) {
  const pixelRatio = window.devicePixelRatio || 1
  return Math.round(value * pixelRatio) / pixelRatio
}

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
  const rawLeftPx = span > 0 && widthPx > 0 ? Math.min(widthPx, Math.max(0, ((second - viewStart) / span) * widthPx)) : 0
  const left = roundToDevicePixel(rawLeftPx)

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      {/* Vertical line */}
      <div className="pointer-events-none absolute bottom-0 top-0 w-px -translate-x-1/2 bg-primary" style={{ left }} />
      {/* Inverted-house handle */}
      <div className="pointer-events-auto absolute -top-1 -translate-x-1/2 cursor-grab p-1 active:cursor-grabbing" style={{ left }} {...dragHandlers}>
        <svg width="14" height="13" viewBox="0 0 14 13" className="fill-primary" aria-hidden="true">
          <polygon points="1,0 13,0 13,5 7,13 1,5" />
        </svg>
      </div>
    </div>
  )
}
