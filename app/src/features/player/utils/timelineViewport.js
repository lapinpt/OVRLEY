/**
 * Pure viewport, range, and tick helpers for the player timeline.
 */

import { clamp } from '@/lib/utils'
import { formatTimelineTime } from './playerTiming'
import { secondsToViewPx } from './timelineGeometry'

const VIEWPORT_MATCH_EPSILON_SECONDS = 0.001
const ZOOM_FACTOR = 1.6
const MIN_ZOOM_SPAN = 0.5
const FIT_MIN_SPAN = 2
const FIT_PADDING_RATIO = 0.04
const TICK_TARGET_PX = 90
const MAX_ZOOM_MAJOR_STEP_SECONDS = 2
const FOLLOW_LEAD_RATIO = 0.15
const NICE_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800, 3600]

/**
 * Compares two viewports with a small tolerance.
 *
 * @param {{ viewStart: number, viewEnd: number }|null} a First range.
 * @param {{ viewStart: number, viewEnd: number }|null} b Second range.
 * @returns {boolean} Whether both ranges are effectively equal.
 */
export function rangesMatch(a, b) {
  if (!a || !b) return false
  return Math.abs(a.viewStart - b.viewStart) <= VIEWPORT_MATCH_EPSILON_SECONDS && Math.abs(a.viewEnd - b.viewEnd) <= VIEWPORT_MATCH_EPSILON_SECONDS
}

/**
 * Clamps a viewport so it stays within [0, totalDuration].
 *
 * @param {number} viewStart Visible window start in seconds.
 * @param {number} viewEnd Visible window end in seconds.
 * @param {number} totalDuration Total playable duration in seconds.
 * @returns {{ viewStart: number, viewEnd: number }} Clamped viewport.
 */
export function clampToView(viewStart, viewEnd, totalDuration) {
  const safe = Math.max(0, Number(totalDuration) || 0)
  const span = clamp(viewEnd - viewStart, 0, safe)
  const clampedStart = clamp(viewStart, 0, Math.max(0, safe - span))
  return { viewStart: clampedStart, viewEnd: clampedStart + span }
}

/**
 * Fits the viewport to the full playable range.
 *
 * @param {number} totalDuration Total playable duration in seconds.
 * @returns {{ viewStart: number, viewEnd: number }} Full-range viewport.
 */
export function fitToFull(totalDuration) {
  const safe = Math.max(0, Number(totalDuration) || 0)
  return { viewStart: 0, viewEnd: safe }
}

function getMinimumZoomSpan(widthPx) {
  const safeWidth = Number(widthPx) || 0
  if (safeWidth <= 0) return MIN_ZOOM_SPAN
  return Math.max(MIN_ZOOM_SPAN, (safeWidth / TICK_TARGET_PX) * MAX_ZOOM_MAJOR_STEP_SECONDS)
}

/**
 * Zooms the viewport by a factor around a pivot point.
 *
 * @param {{ viewStart: number, viewEnd: number, pivot: number, direction: 1|-1, totalDuration: number, widthPx?: number }} options
 * @returns {{ viewStart: number, viewEnd: number }} Zoomed viewport.
 */
export function zoomRange({ viewStart, viewEnd, pivot, direction, totalDuration, widthPx = 0 }) {
  const safeTotal = Math.max(0, Number(totalDuration) || 0)
  const span = viewEnd - viewStart
  const clampedPivot = clamp(Number(pivot) || 0, viewStart, viewEnd)
  const ratio = span > 0 ? (clampedPivot - viewStart) / span : 0.5
  const minSpan = Math.min(getMinimumZoomSpan(widthPx), safeTotal)

  const factor = direction >= 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR
  let newSpan = clamp(span * factor, minSpan, safeTotal)

  let newStart = clampedPivot - ratio * newSpan
  let newEnd = newStart + newSpan

  if (newStart < 0) {
    newStart = 0
    newEnd = newSpan
  }
  if (newEnd > safeTotal) {
    newEnd = safeTotal
    newStart = Math.max(0, safeTotal - newSpan)
  }

  return { viewStart: newStart, viewEnd: newEnd }
}

/**
 * Fits the viewport to a target range with padding and clamping.
 *
 * @param {{ rangeStart: number, rangeEnd: number, totalDuration: number }} options
 * @returns {{ viewStart: number, viewEnd: number }} Fitted viewport.
 */
export function fitRangeToViewport({ rangeStart, rangeEnd, totalDuration }) {
  const safeTotal = Math.max(0, Number(totalDuration) || 0)
  const safeStart = Math.max(0, Number(rangeStart) || 0)
  const safeEnd = Math.min(safeTotal, Math.max(safeStart, Number(rangeEnd) || 0))
  const rangeSpan = safeEnd - safeStart
  const padding = rangeSpan * FIT_PADDING_RATIO

  let viewStart = safeStart - padding
  let viewEnd = safeEnd + padding
  let span = viewEnd - viewStart

  if (span < FIT_MIN_SPAN && safeTotal >= FIT_MIN_SPAN) {
    const halfExtra = (FIT_MIN_SPAN - span) / 2
    viewStart -= halfExtra
    viewEnd += halfExtra
    span = FIT_MIN_SPAN
  }

  span = Math.min(span, safeTotal)

  if (viewStart < 0) {
    viewStart = 0
    viewEnd = span
  }
  if (viewEnd > safeTotal) {
    viewEnd = safeTotal
    viewStart = Math.max(0, safeTotal - span)
  }

  return { viewStart, viewEnd }
}

/**
 * Shifts the viewport by a delta in seconds.
 *
 * @param {{ viewStart: number, viewEnd: number, deltaSeconds: number, totalDuration: number }} options
 * @returns {{ viewStart: number, viewEnd: number }} Panned viewport.
 */
export function panViewport({ viewStart, viewEnd, deltaSeconds, totalDuration }) {
  const safeTotal = Math.max(0, Number(totalDuration) || 0)
  if (safeTotal <= 0) return { viewStart: 0, viewEnd: 0 }
  const span = viewEnd - viewStart
  if (span >= safeTotal) return { viewStart, viewEnd }
  return clampToView(viewStart + deltaSeconds, viewEnd + deltaSeconds, safeTotal)
}

/**
 * Computes a viewport that keeps the playhead visible during playback.
 *
 * @param {{ playheadSecond: number, viewStart: number, viewEnd: number, totalDuration: number }} options
 * @returns {{ viewStart: number, viewEnd: number }} Updated viewport.
 */
export function followPlayhead({ playheadSecond, viewStart, viewEnd, totalDuration }) {
  const safeTotal = Math.max(0, Number(totalDuration) || 0)
  const span = viewEnd - viewStart
  if (span <= 0 || span >= safeTotal) return { viewStart, viewEnd }
  if (playheadSecond >= viewStart && playheadSecond < viewEnd) return { viewStart, viewEnd }
  const newStart = playheadSecond - FOLLOW_LEAD_RATIO * span
  return clampToView(newStart, newStart + span, safeTotal)
}

/**
 * Builds canonical fit targets for the current media shape.
 *
 * @param {{ totalDuration: number, hasVideo: boolean, videoSyncOffsetSeconds: number, importedVideoDuration: number, hasActivityData: boolean, activityDurationSeconds: number, fallbackDurationSeconds: number }} options
 * @returns {Array<{ id: 'all'|'video'|'activity', label: string, viewport: { viewStart: number, viewEnd: number } }>}
 */
export function buildFitTargets({
  totalDuration,
  hasVideo,
  videoSyncOffsetSeconds,
  importedVideoDuration,
  hasActivityData,
  activityDurationSeconds,
  fallbackDurationSeconds,
}) {
  const targets = [{ id: 'all', label: 'All', viewport: fitToFull(totalDuration) }]

  if (hasVideo) {
    const start = Math.max(0, Number(videoSyncOffsetSeconds) || 0)
    const end = start + (Number(importedVideoDuration) || 0)
    targets.push({
      id: 'video',
      label: 'Video',
      viewport: fitRangeToViewport({ rangeStart: start, rangeEnd: end, totalDuration }),
    })
  }

  if (hasActivityData) {
    const duration = activityDurationSeconds > 0 ? activityDurationSeconds : fallbackDurationSeconds
    targets.push({
      id: 'activity',
      label: 'Activity',
      viewport: fitRangeToViewport({ rangeStart: 0, rangeEnd: duration, totalDuration }),
    })
  }

  return targets
}

/**
 * Resolves which canonical fit target matches the current viewport.
 *
 * @param {{ viewport: { viewStart: number, viewEnd: number }, targets: Array<{ id: string, viewport: { viewStart: number, viewEnd: number } }> }} options
 * @returns {string|null} Matching target id.
 */
export function getMatchingFitTargetId({ viewport, targets }) {
  return targets.find((target) => rangesMatch(viewport, target.viewport))?.id ?? null
}

function formatTickLabel(second, step) {
  if (step < 1) {
    return `${second.toFixed(1)}s`
  }
  return formatTimelineTime(second)
}

/**
 * Computes major and minor ticks for the timeline axis.
 *
 * @param {{ viewStart: number, viewEnd: number, widthPx: number }} options
 * @returns {{ major: Array<{ second: number, x: number, label: string }>, minor: Array<{ second: number, x: number }> }}
 */
export function computeTimelineTicks({ viewStart, viewEnd, widthPx }) {
  const span = viewEnd - viewStart
  if (span <= 0 || widthPx <= 0) return { major: [], minor: [] }

  const pxPerSecond = widthPx / span
  const targetStep = TICK_TARGET_PX / pxPerSecond

  let step = NICE_STEPS[NICE_STEPS.length - 1]
  for (const candidate of NICE_STEPS) {
    if (candidate >= targetStep) {
      step = candidate
      break
    }
  }

  const minorStep = step / 5
  const firstMajor = Math.ceil(viewStart / step) * step
  const firstMinor = Math.ceil(viewStart / minorStep) * minorStep

  const major = []
  for (let second = firstMajor; second <= viewEnd; second += step) {
    const x = clamp(secondsToViewPx({ second, viewStart, viewEnd, widthPx }), 0, widthPx)
    major.push({ second, x, label: formatTickLabel(second, step) })
  }

  const minor = []
  for (let second = firstMinor; second <= viewEnd; second += minorStep) {
    const x = clamp(secondsToViewPx({ second, viewStart, viewEnd, widthPx }), 0, widthPx)
    minor.push({ second, x })
  }

  return { major, minor }
}
