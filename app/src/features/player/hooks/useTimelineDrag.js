import { useCallback, useRef } from 'react'

/**
 * Shared pointer-drag primitive for timeline scrub handles/surfaces.
 *
 * @param {{ getValue: function, onDragStart?: function, onDragMove?: function, onDragEnd?: function, stopPropagation?: boolean }} options
 * @returns {{ onPointerDown: function, onPointerMove: function, onPointerUp: function, onPointerCancel: function }} Pointer handlers.
 */
export default function useTimelineDrag({ getValue, onDragStart, onDragMove, onDragEnd, stopPropagation = false }) {
  const draggingRef = useRef(false)

  const readValue = useCallback(
    (event) => {
      const value = getValue(event)
      return value === null || value === undefined ? undefined : value
    },
    [getValue],
  )

  const handlePointerDown = useCallback(
    (event) => {
      if (stopPropagation) event.stopPropagation()
      if (event.button !== undefined && event.button !== 0) return

      event.currentTarget.setPointerCapture?.(event.pointerId)
      draggingRef.current = true

      const value = readValue(event)
      if (value !== undefined) onDragStart?.(value, event)
    },
    [onDragStart, readValue, stopPropagation],
  )

  const handlePointerMove = useCallback(
    (event) => {
      if (!draggingRef.current) return
      if (stopPropagation) event.stopPropagation()

      const value = readValue(event)
      if (value !== undefined) onDragMove?.(value, event)
    },
    [onDragMove, readValue, stopPropagation],
  )

  const finishDrag = useCallback(
    (event, shouldCommit) => {
      if (!draggingRef.current) return
      if (stopPropagation) event.stopPropagation()

      const value = readValue(event)
      draggingRef.current = false

      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }

      if (shouldCommit && value !== undefined) onDragEnd?.(value, event)
    },
    [onDragEnd, readValue, stopPropagation],
  )

  const handlePointerUp = useCallback(
    (event) => {
      finishDrag(event, true)
    },
    [finishDrag],
  )

  const handlePointerCancel = useCallback(
    (event) => {
      finishDrag(event, false)
    },
    [finishDrag],
  )

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
  }
}
