import { useCallback, useRef } from 'react'
import useTimelineDrag from '../hooks/useTimelineDrag'
import { pointerToSecond } from '../utils/playerTimeline'

/**
 * Renders major/minor ticks and serves as the click-to-seek / drag-to-scrub surface.
 *
 * @param {{ viewStart: number, viewEnd: number, totalDuration: number, widthPx: number, ticks: object, onScrubStart: function, onScrubMove: function, onScrubEnd: function, onScrubCancel?: function }} props
 */
export default function TimelineAxis({ viewStart, viewEnd, totalDuration, widthPx, ticks, onScrubStart, onScrubMove, onScrubEnd, onScrubCancel }) {
  const axisRef = useRef(null)

  const getSecond = useCallback(
    (event) => {
      if (!axisRef.current) return undefined
      const rect = axisRef.current.getBoundingClientRect()
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
  })

  const getTickLeftStyle = useCallback((x) => {
    const pixelRatio = window.devicePixelRatio || 1
    return { left: Math.round(x * pixelRatio) / pixelRatio }
  }, [])

  const getLeftStyle = useCallback(
    (x) => ({
      left: widthPx > 0 ? `${(x / widthPx) * 100}%` : 0,
    }),
    [widthPx],
  )

  return (
    <div ref={axisRef} aria-label="Timeline axis" className="relative h-7 w-full cursor-crosshair select-none my-1" role="group" {...dragHandlers}>
      {/* Minor ticks */}
      {ticks.minor.map((t, i) => (
        <div key={`m-${i}`} className="absolute top-0 h-1.5 w-px bg-border/70" style={getTickLeftStyle(t.x)} />
      ))}
      {/* Major ticks */}
      {ticks.major.map((t, i) => (
        <div key={`M-${i}`}>
          <div className="absolute top-0 h-2.5 w-px bg-border" style={getTickLeftStyle(t.x)} />
          <span className="absolute top-3 -translate-x-1/2 text-[0.6rem] tabular-nums text-muted-foreground" style={getLeftStyle(t.x)}>
            {t.label}
          </span>
        </div>
      ))}
    </div>
  )
}
