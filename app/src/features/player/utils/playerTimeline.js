/**
 * Pure helpers for player timeline calculations and formatting.
 */

import { clamp } from '@/lib/utils'

export { clamp } from '@/lib/utils'

/**
 * Formats a timeline second value as a clock label.
 *
 * @param {number} value - Timeline second value to format.
 * @returns {string} Timeline label in mm:ss or h:mm:ss format.
 */
export function formatTimelineTime(value) {
  const safeValue = Math.max(0, Math.floor(Number(value) || 0))
  const hours = Math.floor(safeValue / 3600)
  const minutes = Math.floor((safeValue % 3600) / 60)
  const seconds = safeValue % 60

  if (hours > 0) {
    return [hours, minutes, seconds].map((part, index) => String(part).padStart(index === 0 ? 1 : 2, '0')).join(':')
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Resolves whether preview playback should be driven by the timeline or video element.
 *
 * @param {object} options - Playback source inputs.
 * @param {boolean} options.shouldUseVideoPlayback - Whether video-backed playback is available.
 * @param {number} options.playheadSecond - Current timeline playhead second.
 * @param {number} options.videoSyncOffsetSeconds - Timeline second where the video starts.
 * @param {number} options.importedVideoDuration - Imported video duration in seconds.
 * @returns {'timeline'|'video'} Playback source for the current playhead.
 */
export function resolvePlaybackSource({ shouldUseVideoPlayback, playheadSecond, videoSyncOffsetSeconds, importedVideoDuration }) {
  if (!shouldUseVideoPlayback) {
    return 'timeline'
  }

  const safePlayheadSecond = Number(playheadSecond) || 0
  const videoStartSecond = Math.max(0, Number(videoSyncOffsetSeconds) || 0)
  const safeVideoDuration = Number(importedVideoDuration)
  const hasVideoEnd = Number.isFinite(safeVideoDuration) && safeVideoDuration > 0
  const videoEndSecond = hasVideoEnd ? videoStartSecond + safeVideoDuration : Number.POSITIVE_INFINITY

  if (safePlayheadSecond < videoStartSecond || safePlayheadSecond >= videoEndSecond) {
    return 'timeline'
  }

  return 'video'
}

/**
 * Computes the largest playable duration across activity, template fallback,
 * and imported-video timing.
 *
 * @param {object} options - Duration inputs.
 * @param {number} options.activityDurationSeconds - Activity-backed duration.
 * @param {number} options.fallbackDurationSeconds - Fallback template duration.
 * @param {number} options.importedVideoDuration - Imported video duration.
 * @param {string|null} options.importedVideoPath - Imported video path when available.
 * @param {number} options.videoSyncOffsetSeconds - Timeline second where the video starts.
 * @returns {number} Total playable duration in seconds.
 */
export function getTotalPlaybackDuration({
  activityDurationSeconds,
  fallbackDurationSeconds,
  importedVideoDuration,
  importedVideoPath,
  videoSyncOffsetSeconds,
}) {
  const metadataDuration = Number(activityDurationSeconds)
  const hasMetadataDuration = Number.isFinite(metadataDuration) && metadataDuration > 0
  const fallbackDuration = Number(fallbackDurationSeconds) || 0
  const videoEnd = importedVideoPath ? (Number(videoSyncOffsetSeconds) || 0) + (Number(importedVideoDuration) || 0) : 0

  return Math.max(hasMetadataDuration ? metadataDuration : fallbackDuration, videoEnd, 0)
}

/**
 * Builds a playback anchor for the active preview clock.
 *
 * Timeline playback stores a wall-clock start time. Paused or video-backed
 * states only preserve the playhead second.
 *
 * @param {object} options - Anchor inputs.
 * @param {'timeline'|'video'} options.source - Playback source that owns the clock.
 * @param {number} options.second - Timeline second to anchor.
 * @param {number} options.nowMs - Current wall-clock time in milliseconds.
 * @returns {{ startedAtMs: number, startedSecond: number }} Playback anchor.
 */
export function createPlaybackAnchor({ source, second, nowMs }) {
  const safeSecond = Number(second) || 0

  if (source === 'timeline') {
    return {
      startedAtMs: nowMs,
      startedSecond: safeSecond,
    }
  }

  return {
    startedAtMs: 0,
    startedSecond: safeSecond,
  }
}

/**
 * Resolves the elapsed timeline second from an active timeline anchor.
 *
 * @param {object} options - Timeline playback inputs.
 * @param {{ startedAtMs: number, startedSecond: number }} options.anchor - Active timeline anchor.
 * @param {number} options.nowMs - Current wall-clock time in milliseconds.
 * @returns {number} Elapsed timeline second.
 */
export function getTimelinePlaybackSecond({ anchor, nowMs }) {
  return anchor.startedSecond + (nowMs - anchor.startedAtMs) / 1000
}

/**
 * Converts a pointer's clientX to a clamped timeline second using the axis
 * rect and the current visible window.
 *
 * @param {number} clientX - Pointer clientX coordinate.
 * @param {DOMRect} axisRect - Bounding rect of the axis element.
 * @param {number} viewStart - Visible window start in seconds.
 * @param {number} viewEnd - Visible window end in seconds.
 * @param {number} widthPx - Fallback measured axis width in pixels.
 * @param {number} totalDuration - Total playable duration for clamping.
 * @returns {number} Clamped timeline second.
 */
export function pointerToSecond(clientX, axisRect, viewStart, viewEnd, widthPx, totalDuration) {
  const span = viewEnd - viewStart
  const effectiveWidth = axisRect.width || widthPx
  if (span <= 0 || effectiveWidth <= 0) return clamp(0, 0, totalDuration)
  const ratio = (clientX - axisRect.left) / effectiveWidth
  const second = viewStart + ratio * span
  return clamp(second, 0, totalDuration)
}

/**
 * Converts a timeline second to a pixel position within the axis.
 *
 * @param {number} second - Timeline second.
 * @param {number} viewStart - Visible window start in seconds.
 * @param {number} viewEnd - Visible window end in seconds.
 * @param {number} widthPx - Measured axis width in pixels.
 * @returns {number} Pixel position from the left edge.
 */
export function secondsToViewPx(second, viewStart, viewEnd, widthPx) {
  const span = viewEnd - viewStart
  if (span <= 0 || widthPx <= 0) return 0
  return ((second - viewStart) / span) * widthPx
}

/**
 * Clamps a viewport [viewStart, viewEnd] so it stays within [0, totalDuration]
 * and never collapses below a single-point range.
 *
 * @param {number} viewStart - Visible window start in seconds.
 * @param {number} viewEnd - Visible window end in seconds.
 * @param {number} totalDuration - Total playable duration in seconds.
 * @returns {{ viewStart: number, viewEnd: number }} Clamped viewport.
 */
export function clampToView(viewStart, viewEnd, totalDuration) {
  const safe = Math.max(0, Number(totalDuration) || 0)
  const span = clamp(viewEnd - viewStart, 0, safe)
  const clampedStart = clamp(viewStart, 0, Math.max(0, safe - span))
  return { viewStart: clampedStart, viewEnd: clampedStart + span }
}

/**
 * Fits the viewport to the full playable range [0, totalDuration].
 *
 * @param {number} totalDuration - Total playable duration in seconds.
 * @returns {{ viewStart: number, viewEnd: number }} Full-range viewport.
 */
export function fitToFull(totalDuration) {
  const safe = Math.max(0, Number(totalDuration) || 0)
  return { viewStart: 0, viewEnd: safe }
}

const TICK_TARGET_PX = 90
const NICE_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1200, 1500, 1800, 3600]

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
  for (const s of NICE_STEPS) {
    if (s >= targetStep) {
      step = s
      break
    }
  }

  const minorStep = step / 5
  const firstMajor = Math.ceil(viewStart / step) * step
  const firstMinor = Math.ceil(viewStart / minorStep) * minorStep

  const major = []
  for (let s = firstMajor; s <= viewEnd; s += step) {
    const x = clamp(secondsToViewPx(s, viewStart, viewEnd, widthPx), 0, widthPx)
    major.push({ second: s, x, label: formatTickLabel(s, step) })
  }

  const minor = []
  for (let s = firstMinor; s <= viewEnd; s += minorStep) {
    const x = clamp(secondsToViewPx(s, viewStart, viewEnd, widthPx), 0, widthPx)
    minor.push({ second: s, x })
  }

  return { major, minor }
}
