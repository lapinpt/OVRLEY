/** Pure presentation geometry and label formatting for linear gauge previews. */

import { getTranslatedTrackCapPath, getTranslatedTrackCapReveal } from '../../shared/trackPathGeometry'
import { NUMERIC_PREVIEW_VERTICAL_METRICS_TEXT } from '@/features/overlay-editor/data/overlayEditorConstants'
import { measurePreviewText } from '../../shared/textMeasurement'

const LINEAR_GAUGE_LABEL_GAP_PX = 8

function originXForCenteredText(measurement, centerX) {
  return centerX - (measurement.boundsLeft + measurement.boundsRight) * 0.5
}

function baselineYForCenteredText(measurement, centerY) {
  return centerY + (measurement.ascent - measurement.descent) * 0.5
}

function getLinearGaugeLabelGap(labelFontSize) {
  return Math.max(labelFontSize * 0.35, LINEAR_GAUGE_LABEL_GAP_PX)
}

/**
 * Computes the fill percentage of a value within a range.
 * Returns a value between 0 and 1, or 0 if the range is invalid.
 *
 * @param {number} value - The current value.
 * @param {number} min - The minimum of the range.
 * @param {number} max - The maximum of the range.
 * @returns {number} Fill fraction (0-1).
 */
export function getFillPercentage(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || max <= min) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

function getLinearInsetRect({ x = 0, y = 0, width, height, borderThickness = 0 }) {
  return {
    x: x + borderThickness,
    y: y + borderThickness,
    width: Math.max(0, width - borderThickness * 2),
    height: Math.max(0, height - borderThickness * 2),
  }
}

/**
 * Computes the fill rectangle for a linear gauge bar, accounting for
 * orientation and border inset.
 *
 * @param {object} params
 * @param {number} params.x - Track left edge.
 * @param {number} params.y - Track top edge.
 * @param {number} params.width - Track width.
 * @param {number} params.height - Track height.
 * @param {number} params.fill - Fill fraction (0-1).
 * @param {string} [params.orientation='horizontal'] - 'horizontal' or 'vertical'.
 * @param {number} [params.borderThickness=0] - Border thickness to inset.
 * @returns {{ x: number, y: number, width: number, height: number }} Fill rect.
 */
export function getLinearFillRect({ x = 0, y = 0, width, height, fill, orientation = 'horizontal', borderThickness = 0 }) {
  const fill01 = Math.min(1, Math.max(0, fill))
  const inner = getLinearInsetRect({ x, y, width, height, borderThickness })
  if (orientation === 'vertical') {
    const filledHeight = inner.height * fill01
    return { x: inner.x, y: inner.y + inner.height - filledHeight, width: inner.width, height: filledHeight }
  }
  return { ...inner, width: inner.width * fill01 }
}

export function getLinearRectCornerRadii(radius, rect) {
  return { rx: Math.min(radius, rect.width * 0.5), ry: Math.min(radius, rect.height * 0.5) }
}

function getLinearSegmentModel(rect, borderThickness, cornerRadius) {
  const inner = getLinearInsetRect({ ...rect, borderThickness })
  return {
    outer: { ...rect, ...getLinearRectCornerRadii(cornerRadius, rect) },
    inner: { ...inner, ...getLinearRectCornerRadii(Math.max(0, cornerRadius - borderThickness), inner) },
  }
}

export function getLinearSegmentModels(rects, borderThickness, cornerRadius) {
  const segments = []
  for (const rect of rects) segments.push(getLinearSegmentModel(rect, borderThickness, cornerRadius))
  return segments
}

export function getLinearGaugeLabelLayout({ data, labelFontFamily, minLabel, maxLabel }) {
  const gap = getLinearGaugeLabelGap(data.min_max_label_font_size)
  const minMeasure = measurePreviewText(minLabel, data.min_max_label_font_size, labelFontFamily)
  const maxMeasure = measurePreviewText(maxLabel, data.min_max_label_font_size, labelFontFamily)
  const fontMetrics = measurePreviewText(NUMERIC_PREVIEW_VERTICAL_METRICS_TEXT, data.min_max_label_font_size, labelFontFamily)

  if (data.orientation === 'vertical') {
    if (data.min_max_label_position === 'right') {
      return {
        min: { x: data.width + gap - minMeasure.boundsLeft, y: baselineYForCenteredText(minMeasure, data.height) },
        max: { x: data.width + gap - maxMeasure.boundsLeft, y: baselineYForCenteredText(maxMeasure, 0) },
      }
    }

    return {
      min: { x: -gap - minMeasure.boundsRight, y: baselineYForCenteredText(minMeasure, data.height) },
      max: { x: -gap - maxMeasure.boundsRight, y: baselineYForCenteredText(maxMeasure, 0) },
    }
  }

  const baseline = data.min_max_label_position === 'top' ? -gap - fontMetrics.fontDescent : data.height + gap + fontMetrics.fontAscent

  return {
    min: { x: originXForCenteredText(minMeasure, 0), y: baseline },
    max: { x: originXForCenteredText(maxMeasure, data.width), y: baseline },
  }
}

/**
 * Computes the min/max range from a series of values.
 * Falls back to 0-100 if no finite values exist.
 *
 * @param {number[]} values - Array of numeric values.
 * @returns {{ min: number, max: number }} The value range.
 */
export function getLinearGaugeRange(values) {
  const finiteValues = []
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) finiteValues.push(value)
  }
  if (finiteValues.length === 0) return { min: 0, max: 100 }
  const min = Math.min(...finiteValues)
  const max = Math.max(...finiteValues)
  return max > min ? { min, max } : { min: 0, max: 100 }
}

/**
 * Computes the complete linear gauge layout from widget data.
 * Returns the value range, fill percentage, and track/fill rectangles.
 *
 * @param {object} params
 * @param {number} params.value - Current metric value.
 * @param {number[]} params.values - Full metric series (for range computation).
 * @param {number} params.width - Track width.
 * @param {number} params.height - Track height.
 * @param {string} [params.orientation='horizontal'] - Gauge orientation.
 * @param {number} [params.borderThickness=0] - Border inset.
 * @returns {{ min: number, max: number, fill: number, innerTrackRect: object, fillRect: object }}
 */
export function getLinearGaugeLayout({ value, values, width, height, orientation = 'horizontal', borderThickness = 0 }) {
  const range = getLinearGaugeRange(values)
  const hasValue = typeof value === 'number' && Number.isFinite(value)
  const fill = hasValue ? getFillPercentage(value, range.min, range.max) : 0.5
  const innerTrackRect = getLinearInsetRect({ width, height, borderThickness })
  return {
    ...range,
    fill,
    innerTrackRect,
    fillRect: getLinearFillRect({ ...innerTrackRect, fill, orientation }),
  }
}

function getLinearTrackCapGeometry(trackRect, orientation, cornerRadius) {
  if (orientation === 'vertical') {
    return {
      frame: {
        origin: {
          x: trackRect.x + trackRect.width * 0.5,
          y: trackRect.y + trackRect.height - cornerRadius,
        },
        tangent: { x: 0, y: -1 },
        normal: { x: 1, y: 0 },
      },
      trackThickness: trackRect.width,
    }
  }

  return {
    frame: {
      origin: {
        x: trackRect.x + cornerRadius,
        y: trackRect.y + trackRect.height * 0.5,
      },
      tangent: { x: 1, y: 0 },
      normal: { x: 0, y: 1 },
    },
    trackThickness: trackRect.height,
  }
}

/**
 * Builds the fixed rounded cap used before a normal linear fill rectangle is
 * wide or tall enough to contain its configured corner radius.
 */
export function getLinearTranslatedFillPath({ trackRect, fillRect, orientation, cornerRadius }) {
  const revealedLength = orientation === 'vertical' ? fillRect.height : fillRect.width
  const translatedCap = getTranslatedTrackCapReveal({ revealedLength, cornerRadius })
  if (!translatedCap) return ''

  return getTranslatedTrackCapPath({ ...getLinearTrackCapGeometry(trackRect, orientation, cornerRadius), ...translatedCap })
}
