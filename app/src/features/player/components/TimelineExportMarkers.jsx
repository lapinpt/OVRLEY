import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { SimpleTooltip } from '@/components/ui/simple-tooltip'
import { formatExportRangeTime, timeToSeconds } from '@/features/overlay-editor/utils/exportRange'
import useStore from '@/store/useStore'
import useTimelineDrag from '../hooks/useTimelineDrag'
import { clamp, clampExportRangeMarkerSecond, pointerToSecond, secondsToViewPx } from '../utils/playerTimeline'

function roundToDevicePixel(value) {
  const pixelRatio = window.devicePixelRatio || 1
  return Math.round(value * pixelRatio) / pixelRatio
}

function getMarkerLabel(marker) {
  return marker === 'from' ? 'Export in' : 'Export out'
}

/**
 * Draggable export-range in/out markers shown when a custom export range is active.
 *
 * @param {{ viewStart: number, viewEnd: number, totalDuration: number, widthPx: number, onPreviewRangeChange?: function }} props
 */
export default function TimelineExportMarkers({ viewStart, viewEnd, totalDuration, widthPx, onPreviewRangeChange }) {
  const { exportRange, setExportRange } = useStore(
    useShallow((state) => ({
      exportRange: state.exportRange,
      setExportRange: state.setExportRange,
    })),
  )
  const containerRef = useRef(null)
  const writtenRangeRef = useRef({
    fromTime: exportRange?.fromTime,
    toTime: exportRange?.toTime,
  })
  const [dragPreview, setDragPreview] = useState(null)

  useEffect(() => {
    writtenRangeRef.current = {
      fromTime: exportRange?.fromTime,
      toTime: exportRange?.toTime,
    }
  }, [exportRange])

  const getSecond = useCallback(
    (event) => {
      if (!containerRef.current) return undefined
      const rect = containerRef.current.getBoundingClientRect()
      return pointerToSecond(event.clientX, rect, viewStart, viewEnd, widthPx, totalDuration)
    },
    [totalDuration, viewEnd, viewStart, widthPx],
  )

  const fromSecond = clamp(timeToSeconds(exportRange?.fromTime), 0, totalDuration)
  const toSecond = clamp(timeToSeconds(exportRange?.toTime), 0, totalDuration)
  const displayedFromSecond = dragPreview?.marker === 'from' ? dragPreview.second : fromSecond
  const displayedToSecond = dragPreview?.marker === 'to' ? dragPreview.second : toSecond

  const previewMarker = useCallback(
    (marker, nextSecond) => {
      const previewSecond = clampExportRangeMarkerSecond({
        marker,
        second: nextSecond,
        fromSecond: displayedFromSecond,
        toSecond: displayedToSecond,
        totalDuration,
      })
      setDragPreview({
        marker,
        second: previewSecond,
      })
      onPreviewRangeChange?.({
        fromSecond: marker === 'from' ? previewSecond : displayedFromSecond,
        toSecond: marker === 'to' ? previewSecond : displayedToSecond,
      })
    },
    [displayedFromSecond, displayedToSecond, onPreviewRangeChange, totalDuration],
  )

  const commitMarker = useCallback(
    (marker, nextSecond) => {
      const snappedSecond = clampExportRangeMarkerSecond({
        marker,
        second: Math.round(nextSecond),
        fromSecond: displayedFromSecond,
        toSecond: displayedToSecond,
        totalDuration,
      })
      const field = marker === 'from' ? 'fromTime' : 'toTime'
      const nextTime = formatExportRangeTime(snappedSecond)

      setDragPreview(null)
      onPreviewRangeChange?.(null)
      if (writtenRangeRef.current[field] === nextTime) return

      writtenRangeRef.current = {
        ...writtenRangeRef.current,
        [field]: nextTime,
      }
      setExportRange({ [field]: nextTime })
    },
    [displayedFromSecond, displayedToSecond, onPreviewRangeChange, setExportRange, totalDuration],
  )

  const cancelPreview = useCallback(() => {
    setDragPreview(null)
    onPreviewRangeChange?.(null)
  }, [onPreviewRangeChange])

  if (exportRange?.type !== 'custom') {
    return null
  }

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0">
      <ExportMarker
        marker="from"
        second={displayedFromSecond}
        viewStart={viewStart}
        viewEnd={viewEnd}
        widthPx={widthPx}
        getSecond={getSecond}
        onPreview={previewMarker}
        onCommit={commitMarker}
        onCancel={cancelPreview}
      />
      <ExportMarker
        marker="to"
        second={displayedToSecond}
        viewStart={viewStart}
        viewEnd={viewEnd}
        widthPx={widthPx}
        getSecond={getSecond}
        onPreview={previewMarker}
        onCommit={commitMarker}
        onCancel={cancelPreview}
      />
    </div>
  )
}

function ExportMarker({ marker, second, viewStart, viewEnd, widthPx, getSecond, onPreview, onCommit, onCancel }) {
  const isVisible = second >= viewStart && second <= viewEnd && widthPx > 0 && viewEnd > viewStart
  const left = roundToDevicePixel(secondsToViewPx(second, viewStart, viewEnd, widthPx))
  const label = getMarkerLabel(marker)

  const previewMarker = useCallback(
    (nextSecond) => {
      onPreview(marker, nextSecond)
    },
    [marker, onPreview],
  )

  const commitMarker = useCallback(
    (nextSecond) => {
      onCommit(marker, nextSecond)
    },
    [marker, onCommit],
  )

  const dragHandlers = useTimelineDrag({
    getValue: getSecond,
    onDragStart: previewMarker,
    onDragMove: previewMarker,
    onDragEnd: commitMarker,
    onDragCancel: onCancel,
    stopPropagation: true,
  })

  if (!isVisible) {
    return null
  }

  return (
    <>
      <div className="pointer-events-none absolute bottom-0 top-0 w-px -translate-x-1/2 bg-success" style={{ left }} />
      <div className="pointer-events-auto absolute -top-1 z-20 -translate-x-1/2" style={{ left }}>
        <SimpleTooltip side="top" content={label}>
          <button
            type="button"
            aria-label={label}
            className="flex h-6 w-5 cursor-ew-resize items-start justify-center bg-transparent p-0 text-success outline-none focus-visible:ring-2 focus-visible:ring-success/50 active:cursor-ew-resize"
            {...dragHandlers}
          >
            <span
              aria-hidden="true"
              className={`mt-1 h-4 w-2.5 bg-success/10 ${marker === 'from' ? 'rounded-l-sm border-b-2 border-l-2 border-t-2' : 'rounded-r-sm border-b-2 border-r-2 border-t-2'} border-success`}
            />
          </button>
        </SimpleTooltip>
      </div>
    </>
  )
}
