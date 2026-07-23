import { pathLine, pathMove } from '../../shared/trackPathGeometry'

const START_ANGLE = 210
const SWEEP_ANGLE = 120
const CENTER_ANGLE = 270
const MAX_FILL_SWEEP = 60
const FRAME_MARGIN = 4

function formatPathNumber(value) {
  return Number(value.toFixed(6))
}

function polarPoint(centerX, centerY, radius, angle) {
  const radians = (angle * Math.PI) / 180
  return {
    x: formatPathNumber(centerX + radius * Math.cos(radians)),
    y: formatPathNumber(centerY + radius * Math.sin(radians)),
  }
}

/**
 * Resolves the static lean-angle annular-sector geometry.
 * @param {{width: number, height: number, track_thickness: number}} data
 * @returns {{centerX: number, centerY: number, outerRadius: number, innerRadius: number, startAngle: number, sweepAngle: number}}
 */
export function getLeanAngleGeometry(data) {
  const centerX = data.width / 2
  const centerY = data.height / 2
  const outerRadius = getLeanAngleOuterRadius(data.width, data.height)
  const innerRadius = outerRadius - data.track_thickness
  if (innerRadius <= 0) throw new Error('lean_angle track_thickness must leave a positive inner radius')

  return {
    centerX,
    centerY,
    outerRadius,
    innerRadius,
    startAngle: START_ANGLE,
    sweepAngle: SWEEP_ANGLE,
  }
}

/**
 * Returns the largest sector radius that fits inside the frame margin.
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function getLeanAngleOuterRadius(width, height) {
  const horizontalRadius = (width / 2 - FRAME_MARGIN) / Math.cos(Math.PI / 6)
  return Math.min(horizontalRadius, height / 2 - FRAME_MARGIN)
}

/**
 * Builds the SVG path for the static lean-angle annular sector (full geometry, used for border).
 * @param {ReturnType<typeof getLeanAngleGeometry>} geometry
 * @returns {string}
 */
export function getLeanAngleOuterTrackPath(geometry) {
  return getLeanAngleSectorPath(geometry, geometry.startAngle, geometry.sweepAngle)
}

/**
 * Returns the usable track width after applying the inward border on both
 * sides, matching linear-bar geometry.
 *
 * @param {number} trackThickness
 * @param {number} borderThickness
 * @returns {number}
 */
export function getLeanAngleTrackWidth(trackThickness, borderThickness) {
  const trackWidth = trackThickness - borderThickness * 2
  if (trackWidth <= 0) throw new Error('lean_angle track_border_thickness must leave a positive track width')
  return trackWidth
}

/**
 * Builds the inner lean-angle track geometry after applying the border inset.
 *
 * @param {ReturnType<typeof getLeanAngleGeometry>} geometry
 * @param {number} borderThickness
 * @returns {ReturnType<typeof getLeanAngleGeometry>}
 */
export function getLeanAngleInnerGeometry(geometry, borderThickness) {
  const trackWidth = getLeanAngleTrackWidth(geometry.outerRadius - geometry.innerRadius, borderThickness)
  const outerRadius = geometry.outerRadius - borderThickness

  return {
    ...geometry,
    outerRadius,
    innerRadius: outerRadius - trackWidth,
  }
}

/**
 * Builds the SVG path for the inner track, inset by the border on both sides.
 * @param {ReturnType<typeof getLeanAngleGeometry>} geometry
 * @param {number} borderThickness
 * @returns {string}
 */
export function getLeanAngleInnerTrackPath(geometry, borderThickness) {
  const innerGeometry = getLeanAngleInnerGeometry(geometry, borderThickness)
  const direction = Math.sign(geometry.sweepAngle)
  const maxAngleOffset = Math.abs(geometry.sweepAngle) * 0.5
  const arcs = [
    { radius: innerGeometry.outerRadius, reverse: false },
    { radius: innerGeometry.innerRadius, reverse: true },
  ].map(({ radius, reverse }) => {
    const angleOffset = getParallelSideAngleOffset(borderThickness, radius, maxAngleOffset)
    const insetSweep = geometry.sweepAngle - direction * angleOffset * 2

    return {
      radius,
      startAngle: reverse
        ? geometry.startAngle + geometry.sweepAngle - direction * angleOffset
        : geometry.startAngle + direction * angleOffset,
      sweepAngle: reverse ? -insetSweep : insetSweep,
    }
  })

  return getAnnularSectorPath(innerGeometry, arcs)
}

function getParallelSideAngleOffset(borderThickness, radius, maxAngleOffset) {
  if (borderThickness === 0) return 0
  return Math.min(Math.asin(borderThickness / radius) * (180 / Math.PI), maxAngleOffset)
}

/**
 * Maps a signed lean-angle sample to the dynamic fill sweep.
 * @param {number|null|undefined} raw - Signed interpolated lean angle.
 * @returns {number} Signed sweep in degrees, positive toward the right.
 */
export function getLeanAngleFillSweep(raw) {
  if (raw === null || raw === undefined || raw === 0) return 0

  const magnitude = Math.min(Math.abs(raw), MAX_FILL_SWEEP)
  return raw > 0 ? magnitude : -magnitude
}

/**
 * Builds the dynamic fill path from the centre vertical inside the inner track.
 * @param {ReturnType<typeof getLeanAngleGeometry>} geometry
 * @param {number|null|undefined} raw - Signed interpolated lean angle.
 * @param {number} borderThickness
 * @returns {string} SVG path 'd' attribute value, or an empty string for no fill.
 */
export function getLeanAngleFillPath(geometry, raw, borderThickness) {
  const sweep = getLeanAngleFillSweep(raw)
  if (sweep === 0) return ''
  const innerGeometry = getLeanAngleInnerGeometry(geometry, borderThickness)
  return getLeanAngleSectorPath(innerGeometry, CENTER_ANGLE, sweep)
}

function getLeanAngleSectorPath(geometry, startAngle, sweepAngle) {
  return getAnnularSectorPath(geometry, [
    { radius: geometry.outerRadius, startAngle, sweepAngle },
    { radius: geometry.innerRadius, startAngle: startAngle + sweepAngle, sweepAngle: -sweepAngle },
  ])
}

function getAnnularSectorPath(geometry, arcs) {
  const [outerArc, innerArc] = arcs
  return [
    pathMove(getArcStart(geometry, outerArc)),
    getArcPathCommand(geometry, outerArc),
    pathLine(getArcStart(geometry, innerArc)),
    getArcPathCommand(geometry, innerArc),
    'Z',
  ].join(' ')
}

function getArcStart(geometry, arc) {
  return polarPoint(geometry.centerX, geometry.centerY, arc.radius, arc.startAngle)
}

function getArcPathCommand(geometry, arc) {
  const end = polarPoint(geometry.centerX, geometry.centerY, arc.radius, arc.startAngle + arc.sweepAngle)
  const radius = formatPathNumber(arc.radius)
  const sweepFlag = arc.sweepAngle > 0 ? 1 : 0
  return `A ${radius} ${radius} 0 0 ${sweepFlag} ${end.x} ${end.y}`
}
