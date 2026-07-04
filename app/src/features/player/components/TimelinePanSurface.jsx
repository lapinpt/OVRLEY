import { useCallback, useRef } from 'react'
import useTimelineDrag from '../hooks/useTimelineDrag'

/**
 * Lane background drag surface. Dragging left reveals later timeline seconds;
 * dragging right reveals earlier seconds. Accepts children (clip lanes) rendered inside.
 *
 * @param {{ viewStart: number, viewEnd: number, widthPx: number, onPanBy: function, onPanStart: function, onPanEnd: function, children?: React.ReactNode }} props
 */
export default function TimelinePanSurface({ viewStart, viewEnd, widthPx, onPanBy, onPanStart, onPanEnd, children }) {
  const lastClientXRef = useRef(null)
  const pxPerSecond = widthPx > 0 && viewEnd > viewStart ? widthPx / (viewEnd - viewStart) : 0

  const getClientX = useCallback((event) => event.clientX, [])

  const handlePanStart = useCallback(
    (clientX) => {
      lastClientXRef.current = clientX
      onPanStart()
    },
    [onPanStart],
  )

  const handlePanMove = useCallback(
    (clientX) => {
      if (lastClientXRef.current === null || pxPerSecond <= 0) return

      const deltaSeconds = (lastClientXRef.current - clientX) / pxPerSecond
      lastClientXRef.current = clientX
      if (deltaSeconds !== 0) onPanBy(deltaSeconds)
    },
    [onPanBy, pxPerSecond],
  )

  const finishPan = useCallback(() => {
    lastClientXRef.current = null
    onPanEnd()
  }, [onPanEnd])

  const dragHandlers = useTimelineDrag({
    getValue: getClientX,
    onDragStart: handlePanStart,
    onDragMove: handlePanMove,
    onDragEnd: finishPan,
    onDragCancel: finishPan,
  })

  return (
    <div
      aria-label="Timeline lane background"
      className="relative w-full cursor-e-resize select-none bg-foreground/10 active:cursor-e-resize border border-border/40 space-y-0.5 py-1"
      role="group"
      {...dragHandlers}
    >
      {children}
    </div>
  )
}
