/**
 * Owns custom export-range marker state for the player timeline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { formatExportRangeTime, timeToSeconds } from '@/features/overlay-editor/utils/exportRange'
import useStore from '@/store/useStore'
import { clamp } from '@/lib/utils'
import { clampExportRangeMarkerSecond } from '../utils/timelineGeometry'

function getMarkerLabel(marker) {
  return marker === 'from' ? 'Export from' : 'Export to'
}

/**
 * Owns custom export-range state, marker preview, clamping, snapping, and store writes.
 *
 * @param {{ totalDuration: number }} options Export timeline inputs.
 * @param {number} options.totalDuration Total playable duration used to clamp markers.
 * @returns {object} Export range timeline state and commands.
 */
export default function useExportRangeTimeline({ totalDuration }) {
  // Store selector - export range inputs remain the source of truth outside active drag preview.
  const { exportRange, importedVideoPath, setExportRange } = useStore(
    useShallow((state) => ({
      exportRange: state.exportRange,
      importedVideoPath: state.importedVideoPath,
      setExportRange: state.setExportRange,
    })),
  )

  // Last-write ref - prevents redundant store writes while dragging to the same snapped time.
  const writtenRangeRef = useRef({
    fromTime: exportRange?.fromTime,
    toTime: exportRange?.toTime,
  })

  // Drag preview - marker movement is visible immediately without committing sidebar/export state.
  const [dragPreview, setDragPreview] = useState(null)

  // Store sync - reset write tracking whenever another UI changes the export range.
  useEffect(() => {
    writtenRangeRef.current = {
      fromTime: exportRange?.fromTime,
      toTime: exportRange?.toTime,
    }
  }, [exportRange])

  // Displayed seconds - preview state temporarily overrides the persisted marker being dragged.
  const isCustom = exportRange?.type === 'custom' && !importedVideoPath
  const fromSecond = clamp(timeToSeconds(exportRange?.fromTime), 0, totalDuration)
  const toSecond = clamp(timeToSeconds(exportRange?.toTime), 0, totalDuration)
  const displayedFromSecond = dragPreview?.marker === 'from' ? dragPreview.second : fromSecond
  const displayedToSecond = dragPreview?.marker === 'to' ? dragPreview.second : toSecond

  // Preview command - clamp continuously so markers never cross or leave the timeline while dragging.
  const previewMarker = useCallback(
    (marker, second) => {
      if (!isCustom) return

      const previewSecond = clampExportRangeMarkerSecond({
        marker,
        second,
        fromSecond: displayedFromSecond,
        toSecond: displayedToSecond,
        totalDuration,
      })

      setDragPreview({
        marker,
        second: previewSecond,
      })
    },
    [displayedFromSecond, displayedToSecond, isCustom, totalDuration],
  )

  // Commit command - snap to whole seconds because export range persistence is timecode based.
  const commitMarker = useCallback(
    (marker, second) => {
      if (!isCustom) return

      const snappedSecond = clampExportRangeMarkerSecond({
        marker,
        second: Math.round(second),
        fromSecond: displayedFromSecond,
        toSecond: displayedToSecond,
        totalDuration,
      })
      const field = marker === 'from' ? 'fromTime' : 'toTime'
      const nextTime = formatExportRangeTime(snappedSecond)

      setDragPreview(null)
      if (writtenRangeRef.current[field] === nextTime) return

      writtenRangeRef.current = {
        ...writtenRangeRef.current,
        [field]: nextTime,
      }
      setExportRange({ [field]: nextTime })
    },
    [displayedFromSecond, displayedToSecond, isCustom, setExportRange, totalDuration],
  )

  // Cancel command - pointer cancellation drops transient preview without touching store state.
  const cancelMarkerPreview = useCallback(() => {
    setDragPreview(null)
  }, [])

  // Highlight model - lanes use this same range so preview markers and clip shading stay aligned.
  const highlightRange = useMemo(() => {
    if (!isCustom) return null

    return {
      fromSecond: displayedFromSecond,
      toSecond: displayedToSecond,
    }
  }, [displayedFromSecond, displayedToSecond, isCustom])

  // Marker model - presentational surface only receives labels and timeline seconds for visible markers.
  const markers = useMemo(() => {
    if (!isCustom) return []

    return [
      {
        marker: 'from',
        label: getMarkerLabel('from'),
        second: displayedFromSecond,
      },
      {
        marker: 'to',
        label: getMarkerLabel('to'),
        second: displayedToSecond,
      },
    ]
  }, [displayedFromSecond, displayedToSecond, isCustom])

  // Export timeline API - gesture hooks call commands, components render derived marker models.
  return {
    cancelMarkerPreview,
    commitMarker,
    highlightRange,
    isCustom,
    markers,
    previewMarker,
  }
}
