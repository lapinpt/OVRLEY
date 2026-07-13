/**
 * Shared SVG preview utility functions used across per-widget renderers.
 */

import { findPointAtProgress } from '@/lib/geometryUtils'

/**
 * Sanitizes a string for use as an SVG element ID.
 *
 * Replaces all non-alphanumeric characters (except hyphens and underscores)
 * with underscores to prevent invalid SVG id attributes.
 *
 * @param {string} value - Raw ID string.
 * @returns {string} Sanitized ID safe for SVG use.
 */
export function sanitizeSvgId(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * Normalizes a shadow color string, splitting 8-digit hex into separate color and opacity components.
 *
 * For 8-character hex values, the last two digits are treated as alpha and combined
 * with the explicit opacity parameter. For all other formats, opacity is passed through.
 *
 * @param {string} color - Raw color string (hex, named, etc.).
 * @param {number} [opacity=1] - Additional opacity multiplier.
 * @returns {{ color: string, opacity: number }} Normalized hex color and clamped opacity.
 */
export function normalizeSvgShadowColor(color, opacity = 1) {
  const rawColor = color.trim()
  const hex = rawColor.startsWith('#') ? rawColor.slice(1) : rawColor

  if (/^[0-9a-fA-F]{8}$/.test(hex)) {
    const alpha = parseInt(hex.slice(6, 8), 16) / 255
    return {
      color: `#${hex.slice(0, 6)}`,
      opacity: alpha * opacity,
    }
  }

  return {
    color: rawColor,
    opacity,
  }
}

/**
 * Checks whether two 2D points are approximately equal within a small epsilon.
 *
 * @param {number[]|null|undefined} left - First point [x, y].
 * @param {number[]|null|undefined} right - Second point [x, y].
 * @returns {boolean} True if both points are within 1e-3 Euclidean distance.
 */
function pointsEqual(left, right) {
  return Math.hypot(right[0] - left[0], right[1] - left[1]) <= 1e-3
}

/**
 * Normalizes an opacity value handling both percentage (0–100) and decimal (0–1) ranges.
 *
 * Values > 1 are treated as percentages and divided by 100.
 *
 * @param {number|null|undefined} value - Raw opacity value.
 * @param {number} fallback - Fallback opacity if value is null, undefined, or non-finite.
 * @returns {number} Clamped opacity in the 0–1 range.
 */
export function percentageToOpacity(value) {
  return value / 100
}

const METRIC_PROGRESS_EPSILON = 1e-6

function compareMarkerRadiusDescending(left, right) {
  return right.radius - left.radius
}

function metricProgressEqual(left, right) {
  return Math.abs(left - right) <= METRIC_PROGRESS_EPSILON
}

function findDuplicateProgressRun(progressValues, targetProgress, anchorIndex) {
  const anchorProgress = progressValues[anchorIndex]

  if (!metricProgressEqual(anchorProgress, targetProgress)) {
    return null
  }

  let start = anchorIndex
  let end = anchorIndex

  while (start > 0 && metricProgressEqual(progressValues[start - 1], anchorProgress)) {
    start -= 1
  }

  while (end + 1 < progressValues.length && metricProgressEqual(progressValues[end + 1], anchorProgress)) {
    end += 1
  }

  return end > start ? { start, end } : null
}

/**
 * Builds the marker layer definitions for a widget's position indicator.
 *
 * Processes widget data points into sorted circle layers (largest radius first),
 * with the innermost layer rendered as a solid fill. Falls back to a single
 * default marker when no custom points are configured.
 *
 * @param {object} widgetData - Widget configuration with optional points array.
 * @param {number} fallbackRadius - Default marker radius if no points defined.
 * @param {string} fallbackColor - Default marker color.
 * @param {number} fallbackOpacity - Default marker opacity.
 * @returns {Array<{radius: number, color: string, opacity: number, solidFill: boolean}>} Sorted marker layers.
 */
export function getPreviewMarkerLayers(widgetData) {
  const sourcePoints = widgetData.points ?? []
  const markerPoints = sourcePoints.length
    ? sourcePoints
    : [
        {
          weight: widgetData.marker_size ** 2,
          color: widgetData.marker_color,
          opacity: widgetData.marker_opacity,
        },
      ]

  const layers = []
  for (const point of markerPoints) {
    layers.push({
      radius: Math.max(Math.sqrt(point.weight), 2),
      color: point.color,
      opacity: percentageToOpacity(point.opacity),
    })
  }
  layers.sort(compareMarkerRadiusDescending)
  for (let index = 0; index < layers.length; index += 1) {
    layers[index].solidFill = index === layers.length - 1
    layers[index].strokeWidth = index === layers.length - 1 ? undefined : Math.min(Math.max(Math.round(layers[index].radius * 0.18), 1), 3)
  }

  const variantRadius = widgetData.marker_variant_diameter * 0.5

  if (widgetData.marker_variant === 'ring' && variantRadius > 0) {
    layers.unshift({
      radius: variantRadius,
      color: widgetData.marker_color,
      opacity: percentageToOpacity(widgetData.marker_opacity),
      solidFill: false,
      strokeWidth: 1.5,
    })
  }

  if (widgetData.marker_variant === 'halo' && variantRadius > 0) {
    layers.unshift({
      radius: variantRadius,
      color: widgetData.marker_color,
      opacity: percentageToOpacity(widgetData.marker_opacity) * 0.35,
      solidFill: true,
      strokeWidth: undefined,
    })
  }

  return layers
}

/**
 * Builds the route frame preview state — determines the marker point and
 * completed segment points from route geometry at a given progress value.
 *
 * Uses metric-distance-based interpolation with fallback to uniform progress,
 * ensuring the marker lands at the correct position along the route.
 *
 * @param {number[][]} points - Route SVG points.
 * @param {number[]} progressValues - Per-point progress values (0–1).
 * @param {number} progress01 - Current progress (0–1).
 * @returns {{ markerPoint: number[]|null, completedPoints: number[][] }} Marker position and completed polyline points.
 */
export function buildRouteFramePreview(points, progressValues, progress01) {
  const metricPoint = findPointAtProgress(points, progressValues, progress01)
  const markerPoint = metricPoint.point
  const lastPoint = points[points.length - 1]
  let completedPoints = pointsEqual(lastPoint, markerPoint) ? [...points] : points.slice(0, Math.min(metricPoint.index, points.length))

  if (!completedPoints.length) {
    completedPoints = [points[0]]
  }

  if (!pointsEqual(completedPoints[completedPoints.length - 1], markerPoint)) {
    completedPoints.push(markerPoint)
  }

  return { markerPoint, completedPoints }
}

/**
 * Builds the completed elevation polyline points for the current frame.
 *
 * Ordinary motion should behave like the route widget: the completed path ends
 * at the distance-based marker position on the geometry. When the activity is in
 * a duplicate-progress run (hover/stop with vertical motion), the path must fill
 * chronologically within that run using elapsed fractions while still staying at
 * the current x-position.
 *
 * @param {number[][]} points - Elevation SVG points.
 * @param {number[]} progressValues - Per-point metric progress values (0–1).
 * @param {number[]} elapsedFractions - Per-point elapsed fractions (0–1).
 * @param {number} progress01 - Current distance progress (0–1).
 * @param {number} frameElapsedFraction - Current frame elapsed fraction (0–1).
 * @returns {number[][]} Points for the completed (ridden) portion of the elevation profile.
 */
export function buildElevationCompletedPoints(points, progressValues, elapsedFractions, progress01, frameElapsedFraction) {
  const metricHit = findPointAtProgress(points, progressValues, progress01)
  const metricIndex = metricHit.index
  const duplicateRun = findDuplicateProgressRun(progressValues, progress01, metricIndex)
  let completedPoints = []
  let completedEndpoint = metricHit.point

  if (duplicateRun) {
    completedPoints = points.slice(0, duplicateRun.start)

    for (let index = duplicateRun.start; index <= duplicateRun.end; index += 1) {
      if (elapsedFractions[index] < frameElapsedFraction) {
        completedPoints.push(points[index])
      }
    }

    const runPoints = points.slice(duplicateRun.start, duplicateRun.end + 1)
    const runElapsedFractions = elapsedFractions.slice(duplicateRun.start, duplicateRun.end + 1)
    completedEndpoint = findPointAtProgress(runPoints, runElapsedFractions, frameElapsedFraction).point
  } else {
    completedPoints = points.slice(0, Math.min(metricIndex, points.length))
  }

  if (!completedPoints.length) {
    completedPoints.push(points[0])
  }

  if (!pointsEqual(completedPoints[completedPoints.length - 1], completedEndpoint)) {
    completedPoints.push(completedEndpoint)
  }

  return completedPoints
}
