/** Product-level layout for normalized arc and corner gauges. */

import { ARC_MAX_ANGLE_DEGREES } from './trackPath'

export const ARC_LABEL_GAP_PX = 8
export const CORNER_GAUGE_DEFAULT_FRAME_SIZE = 110
export const CORNER_GAUGE_INNER_INSET = 22

/** Returns the start/end angles for a vertically symmetric arc. */
export function getArcAngles(arcAngle) {
  return {
    startAngle: 270 - arcAngle * 0.5,
    endAngle: 270 + arcAngle * 0.5,
    sweepAngle: arcAngle,
  }
}

/** Returns the fixed 90-degree track opposite a bottom-corner gauge. */
export function getCornerGaugeAngles(cornerOrientation) {
  return cornerOrientation === 'bottom-right' ? { startAngle: 180, endAngle: 270, sweepAngle: 90 } : { startAngle: 0, endAngle: -90, sweepAngle: -90 }
}

/** Derives the circular radius from widget bounds and track dimensions. */
export function getArcRadius({ width, height, trackThickness, borderThickness }) {
  return Math.max(0, Math.min(width, height) * 0.5 - trackThickness * 0.5 - borderThickness)
}

/** Returns the metric range, ignoring the null gaps used by sparse activity series. */
export function getArcGaugeRange(values) {
  const presentValues = values.filter((value) => value != null)
  if (presentValues.length === 0) return { min: 0, max: 100 }
  const min = Math.min(...presentValues)
  const max = Math.max(...presentValues)
  return max > min ? { min, max } : { min: 0, max: 100 }
}

/** Returns the metric value as a fill fraction within its range. */
export function getArcFillPercentage(value, min, max) {
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

/**
 * Produces the complete arc-track layout from normalized arc-gauge data.
 * @param {object} data - Normalized arc-gauge data.
 * @param {number|null} value - Current metric value.
 * @param {Array<number|null>} values - Metric samples used for the range.
 * @returns {object} Arc geometry and metric range for rendering.
 */
export function getArcGaugeLayout(data, value, values) {
  return getArcShapedGaugeLayout(data, value, values, getArcAngles(data.arc_angle))
}

/**
 * Produces a compact bottom-corner layout from normalized corner-gauge data.
 * @param {object} data - Normalized corner-gauge data.
 * @param {number|null} value - Current metric value.
 * @param {Array<number|null>} values - Metric samples used for the range.
 * @returns {object} Corner-gauge geometry and metric range for rendering.
 */
export function getCornerGaugeLayout(data, value, values) {
  const frameSize = Math.min(data.width, data.height)
  const capPadding = Math.min(frameSize, Math.min(data.track_thickness * 0.5, data.track_corner_radius) + data.track_border_thickness)
  const isBottomRight = data.corner_orientation === 'bottom-right'
  const innerInset = (frameSize * CORNER_GAUGE_INNER_INSET) / CORNER_GAUGE_DEFAULT_FRAME_SIZE

  return getArcShapedGaugeLayout(data, value, values, getCornerGaugeAngles(data.corner_orientation), {
    centerX: isBottomRight ? data.width - capPadding : capPadding,
    centerY: data.height - capPadding,
    radius: frameSize - capPadding - data.track_thickness * 0.5 - data.track_border_thickness,
    innerAnchor: {
      x: isBottomRight ? data.width - innerInset : innerInset,
      y: data.height - innerInset,
    },
  })
}

/** Builds shared arc-shaped geometry for regular and corner gauges. */
function getArcShapedGaugeLayout(data, value, values, angles, variant = {}) {
  const range = getArcGaugeRange(values)
  const fill = value === null ? 0.5 : getArcFillPercentage(value, range.min, range.max)
  const centerX = variant.centerX ?? data.width * 0.5
  const centerY = variant.centerY ?? data.height * 0.5
  const radius =
    variant.radius ??
    getArcRadius({
      width: data.width,
      height: data.height,
      trackThickness: data.track_thickness,
      borderThickness: data.track_border_thickness,
    })
  const fullCircle = Math.abs(angles.sweepAngle) >= ARC_MAX_ANGLE_DEGREES

  return {
    ...range,
    ...angles,
    fill,
    centerX,
    centerY,
    radius,
    trackThickness: data.track_thickness,
    borderThickness: data.track_border_thickness,
    outerStrokeWidth: data.track_thickness + data.track_border_thickness * 2,
    fullCircle,
    innerAnchor: variant.innerAnchor,
    labelAngles: fullCircle ? { min: 180, max: 0 } : { min: angles.startAngle, max: angles.endAngle },
  }
}

/** Returns the gap between an arc track and its min/max labels. */
export function getArcLabelGap(fontSize) {
  return Math.max(fontSize * 0.35, ARC_LABEL_GAP_PX)
}
