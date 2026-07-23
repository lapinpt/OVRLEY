/**
 * Pure timeline geometry helpers for pointer, clip, playhead, and export marker math.
 */

import { clamp } from '@/lib/utils'

export const EXPORT_RANGE_MIN_GAP_SECONDS = 1
export const SNAP_THRESHOLD_PX = 5

/**
 * Rounds a pixel value to the active device pixel grid.
 *
 * @param {number} value Pixel value.
 * @param {number} pixelRatio Device pixel ratio.
 * @returns {number} Rounded pixel value.
 */
export function roundToDevicePixel(value, pixelRatio = 1) {
  const safeRatio = Number(pixelRatio) || 1
  return Math.round((Number(value) || 0) * safeRatio) / safeRatio
}

/**
 * Converts a pointer's clientX to a clamped timeline second.
 *
 * @param {{ clientX: number, rect: DOMRect|{ left?: number, width?: number }, viewStart: number, viewEnd: number, widthPx: number, totalDuration: number }} options
 * @returns {number} Clamped timeline second.
 */
export function pointerToSecond({ clientX, rect, viewStart, viewEnd, widthPx, totalDuration }) {
  const span = viewEnd - viewStart
  const effectiveWidth = rect?.width || widthPx
  if (span <= 0 || effectiveWidth <= 0) return clamp(0, 0, totalDuration)
  const ratio = (clientX - (rect?.left || 0)) / effectiveWidth
  const second = viewStart + ratio * span
  return clamp(second, 0, totalDuration)
}

/**
 * Converts a timeline second to a pixel position within the current viewport.
 *
 * @param {{ second: number, viewStart: number, viewEnd: number, widthPx: number }} options
 * @returns {number} Pixel position from the left edge.
 */
export function secondsToViewPx({ second, viewStart, viewEnd, widthPx }) {
  const span = viewEnd - viewStart
  if (span <= 0 || widthPx <= 0) return 0
  return ((second - viewStart) / span) * widthPx
}

/**
 * Converts a horizontal pixel delta to a second delta in the current viewport.
 *
 * @param {{ deltaPx: number, viewStart: number, viewEnd: number, widthPx: number }} options
 * @returns {number} Second delta.
 */
export function viewPxToSeconds({ deltaPx, viewStart, viewEnd, widthPx }) {
  const span = viewEnd - viewStart
  if (span <= 0 || widthPx <= 0) return 0
  return (deltaPx / widthPx) * span
}

/**
 * Computes the pixel geometry of a clip in the current viewport.
 *
 * @param {{ startSecond: number, durationSeconds: number, viewStart: number, viewEnd: number, widthPx: number }} options
 * @returns {{ x: number, width: number, isVisible: boolean }} Pixel position, width, and visibility.
 */
export function getClipGeometry({ startSecond, durationSeconds, viewStart, viewEnd, widthPx }) {
  const span = viewEnd - viewStart
  const clipEnd = startSecond + durationSeconds
  if (span <= 0 || widthPx <= 0 || clipEnd <= viewStart || startSecond >= viewEnd || durationSeconds <= 0) {
    return { x: 0, width: 0, isVisible: false }
  }
  const x = ((startSecond - viewStart) / span) * widthPx
  const width = (durationSeconds / span) * widthPx
  return { x, width, isVisible: true }
}

/**
 * Clamps a dragged export marker to the legal export window.
 *
 * @param {{ marker: 'from'|'to', second: number, fromSecond: number, toSecond: number, totalDuration: number }} options
 * @returns {number} Clamped marker second.
 */
export function clampExportRangeMarkerSecond({ marker, second, fromSecond, toSecond, totalDuration }) {
  const from = clamp(fromSecond, 0, totalDuration)
  const to = clamp(toSecond, 0, totalDuration)

  if (marker === 'from') {
    return clamp(second, 0, Math.max(0, to - EXPORT_RANGE_MIN_GAP_SECONDS))
  }

  return clamp(second, Math.min(totalDuration, from + EXPORT_RANGE_MIN_GAP_SECONDS), totalDuration)
}

/**
 * Computes the clip-local overlay used to highlight the active export range.
 *
 * @param {{ startSecond: number, durationSeconds: number, exportFromSecond: number, exportToSecond: number }} options
 * @returns {{ isVisible: boolean, leftPercent: number, widthPercent: number }}
 */
/**
 * Snaps a proposed sync offset to alignment points between two clips.
 *
 * Candidates: video‑start → activity‑start (0), video‑start → activity‑end,
 * video‑end → activity‑start, video‑end → activity‑end.
 *
 * The threshold is expressed in pixels, matching react-moveable's default
 * snapThreshold, and converted to timeline seconds for the current viewport.
 *
 * @param {{ proposedOffset: number, activityDuration: number, videoDuration: number, viewStart: number, viewEnd: number, widthPx: number, thresholdPx?: number }} options Snap inputs.
 * @returns {{ offset: number, guidelineSecond: number|null }} Snapped offset and active guideline.
 */
export function snapClipOffset({ proposedOffset, activityDuration, videoDuration, viewStart, viewEnd, widthPx, thresholdPx = SNAP_THRESHOLD_PX }) {
  const candidates = [
    { guidelineSecond: 0, value: 0 },
    { guidelineSecond: activityDuration, value: activityDuration },
    { guidelineSecond: 0, value: -videoDuration },
    { guidelineSecond: activityDuration, value: activityDuration - videoDuration },
  ]
  const span = viewEnd - viewStart
  const thresholdSeconds = span > 0 && widthPx > 0 ? (thresholdPx / widthPx) * span : 0

  let bestDelta = Infinity
  let bestValue = proposedOffset
  let guidelineSecond = null

  for (const candidate of candidates) {
    const delta = Math.abs(proposedOffset - candidate.value)
    if (delta <= thresholdSeconds && delta < bestDelta) {
      bestDelta = delta
      bestValue = candidate.value
      guidelineSecond = candidate.guidelineSecond
    }
  }

  return { guidelineSecond, offset: bestValue }
}

export function getExportRangeHighlightGeometry({ startSecond, durationSeconds, exportFromSecond, exportToSecond }) {
  if (durationSeconds <= 0) return { isVisible: false, leftPercent: 0, widthPercent: 0 }

  const clipEnd = startSecond + durationSeconds
  const highlightStart = Math.max(startSecond, exportFromSecond)
  const highlightEnd = Math.min(clipEnd, exportToSecond)

  if (!(highlightEnd > highlightStart)) {
    return { isVisible: false, leftPercent: 0, widthPercent: 0 }
  }

  return {
    isVisible: true,
    leftPercent: ((highlightStart - startSecond) / durationSeconds) * 100,
    widthPercent: ((highlightEnd - highlightStart) / durationSeconds) * 100,
  }
}
