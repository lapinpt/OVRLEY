const START_ANGLE = 210
const SWEEP_ANGLE = 120
const CENTER_ANGLE = 270
const MAX_FILL_SWEEP = 60
const LABEL_LINE_HEIGHT_RATIO = 0.92

function formatPathNumber(value) {
  return Number(value.toFixed(6))
}

function pathMove(point) {
  return `M ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`
}

function pathLine(point) {
  return `L ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`
}

function polarPoint(centerX, centerY, radius, angle) {
  const radians = (angle * Math.PI) / 180
  return {
    x: formatPathNumber(centerX + radius * Math.cos(radians)),
    y: formatPathNumber(centerY + radius * Math.sin(radians)),
  }
}

function requireFinitePositive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`lean_angle ${field} must be a positive finite number`)
  return value
}

/**
 * Resolves the canonical lean-angle logical frame and annular-sector geometry.
 * @param {{diameter: number, track_thickness: number, font_size: number}} data
 * @returns {{width: number, height: number, minX: number, minY: number, maxX: number, maxY: number, centerX: number, centerY: number, outerRadius: number, innerRadius: number, startAngle: number, sweepAngle: number}}
 */
export function getLeanAngleLayout({ diameter, track_thickness: trackThickness, font_size: fontSize }) {
  requireFinitePositive(diameter, 'diameter')
  requireFinitePositive(trackThickness, 'track_thickness')
  requireFinitePositive(fontSize, 'font_size')

  const outerRadius = diameter / 2
  if (trackThickness >= outerRadius) throw new Error('lean_angle track_thickness must be less than diameter / 2')

  const innerRadius = outerRadius - trackThickness
  const halfSweepRadians = (SWEEP_ANGLE / 2) * (Math.PI / 180)
  const sectorMinX = -outerRadius * Math.sin(halfSweepRadians)
  const sectorMaxX = outerRadius * Math.sin(halfSweepRadians)
  const sectorMinY = -outerRadius
  const sectorMaxY = -innerRadius * Math.cos(halfSweepRadians)
  const labelLineHeight = fontSize * LABEL_LINE_HEIGHT_RATIO
  const minX = sectorMinX
  const maxX = sectorMaxX
  const minY = Math.min(sectorMinY, -labelLineHeight / 2)
  const maxY = Math.max(sectorMaxY, labelLineHeight / 2)

  return {
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
    maxX,
    maxY,
    centerX: -minX,
    centerY: -minY,
    outerRadius,
    innerRadius,
    startAngle: START_ANGLE,
    sweepAngle: SWEEP_ANGLE,
  }
}

/**
 * Resolves the selection frame for a lean-angle widget without changing its
 * canonical SVG viewport. The label may move outside that viewport through
 * `value_offset_y`, so the editor target expands or contracts around it.
 * @param {{diameter: number, track_thickness: number, font_size: number, value_offset_y: number}} data
 * @returns {{width: number, height: number}}
 */
export function getLeanAngleSelectionFrame({ diameter, track_thickness: trackThickness, font_size: fontSize, value_offset_y: valueOffsetY }) {
  if (!Number.isFinite(valueOffsetY)) throw new Error('lean_angle value_offset_y must be a finite number')

  const layout = getLeanAngleLayout({ diameter, track_thickness: trackThickness, font_size: fontSize })
  const labelLineHeight = fontSize * LABEL_LINE_HEIGHT_RATIO
  const labelMinY = valueOffsetY - labelLineHeight / 2
  const labelMaxY = valueOffsetY + labelLineHeight / 2
  const minY = Math.min(-layout.outerRadius, labelMinY)
  const maxY = Math.max(-layout.innerRadius * Math.cos((SWEEP_ANGLE / 2) * (Math.PI / 180)), labelMaxY)

  return {
    width: layout.width,
    height: maxY - minY,
  }
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
 * @param {ReturnType<typeof getLeanAngleLayout>} geometry
 * @param {number} borderThickness
 * @returns {ReturnType<typeof getLeanAngleLayout>}
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
 * Builds the SVG path for the static lean-angle annular sector.
 * @param {ReturnType<typeof getLeanAngleLayout>} geometry
 * @returns {string}
 */
export function getLeanAngleOuterTrackPath(geometry) {
  return getLeanAngleSectorPath(geometry, geometry.startAngle, geometry.sweepAngle)
}

/**
 * Builds the SVG path for the inner track, inset by the border on both sides.
 * @param {ReturnType<typeof getLeanAngleLayout>} geometry
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
      startAngle: reverse ? geometry.startAngle + geometry.sweepAngle - direction * angleOffset : geometry.startAngle + direction * angleOffset,
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
 * @param {ReturnType<typeof getLeanAngleLayout>} geometry
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
