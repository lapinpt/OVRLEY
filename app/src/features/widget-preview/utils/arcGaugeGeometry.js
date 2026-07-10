/**
 * Pure geometry and layout helpers for arc gauges.
 *
 * The functions in this module mirror `render/widgets/gauges/arc/path.rs`: angles
 * use Skia/SVG screen-space coordinates (0° right, 90° down), a 180° gauge
 * runs from left to right over the top, and radius leaves room for the stroke
 * and border inside the smallest widget dimension.
 */

export const ARC_MIN_ANGLE_DEGREES = 30
export const ARC_MAX_ANGLE_DEGREES = 360
export const ARC_LABEL_GAP_PX = 8
export const ARC_INNER_WIDGET_LINE_HEIGHT = 0.92
export const ARC_INNER_WIDGET_UNIT_RATIO = 0.28
export const ARC_INNER_WIDGET_MIN_UNIT_FONT_SIZE = 12
export const ARC_INNER_WIDGET_GAP_PX = 4

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

/**
 * Clamps an angle to the persisted arc-gauge contract. The backend rejects
 * invalid configs; this is only a preview-side runtime safety guard.
 */
export function clampArcAngle(arcAngle) {
  return Math.min(ARC_MAX_ANGLE_DEGREES, Math.max(ARC_MIN_ANGLE_DEGREES, finiteNumber(arcAngle, ARC_MIN_ANGLE_DEGREES)))
}

/**
 * Returns the start/end angles for a vertically symmetric arc.
 */
export function getArcAngles(arcAngle) {
  const angle = clampArcAngle(arcAngle)
  return {
    startAngle: 270 - angle * 0.5,
    endAngle: 270 + angle * 0.5,
    sweepAngle: angle,
  }
}

/**
 * Returns a point on a screen-space circular arc.
 */
export function getArcPoint(centerX, centerY, radius, angle) {
  const radians = (finiteNumber(angle) * Math.PI) / 180
  return {
    x: finiteNumber(centerX) + finiteNumber(radius) * Math.cos(radians),
    y: finiteNumber(centerY) + finiteNumber(radius) * Math.sin(radians),
  }
}

/**
 * Derives the circular radius from the widget bounds, track stroke, and border.
 */
export function getArcRadius({ width, height, trackThickness, borderThickness = 0 }) {
  const outerHalfThickness = Math.max(0, finiteNumber(trackThickness)) * 0.5 + Math.max(0, finiteNumber(borderThickness))
  return Math.max(0, Math.min(finiteNumber(width), finiteNumber(height)) * 0.5 - outerHalfThickness)
}

/**
 * Computes the display range from metric samples, falling back to 0–100 when
 * no meaningful range is available.
 */
export function getArcGaugeRange(values) {
  const finiteValues = (values || []).filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (!finiteValues.length) return { min: 0, max: 100 }
  const min = Math.min(...finiteValues)
  const max = Math.max(...finiteValues)
  return max > min ? { min, max } : { min: 0, max: 100 }
}

/**
 * Computes a clamped fill fraction, returning zero for invalid ranges.
 */
export function getArcFillPercentage(value, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || max <= min) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

/**
 * Produces the complete arc-track layout for SVG preview rendering.
 */
export function getArcGaugeLayout({ value, values, width, height, arcAngle, trackThickness, borderThickness = 0 }) {
  const range = getArcGaugeRange(values)
  const hasValue = typeof value === 'number' && Number.isFinite(value)
  const fill = hasValue ? getArcFillPercentage(value, range.min, range.max) : 0.5
  const centerX = finiteNumber(width) * 0.5
  const centerY = finiteNumber(height) * 0.5
  const thickness = Math.max(0, finiteNumber(trackThickness))
  const border = Math.max(0, finiteNumber(borderThickness))
  const angles = getArcAngles(arcAngle)
  const radius = getArcRadius({ width, height, trackThickness: thickness, borderThickness: border })
  const fullCircle = angles.sweepAngle >= ARC_MAX_ANGLE_DEGREES
  const labelAngles = fullCircle ? { min: 180, max: 0 } : { min: angles.startAngle, max: angles.endAngle }

  return {
    ...range,
    ...angles,
    fill,
    centerX,
    centerY,
    radius,
    trackThickness: thickness,
    borderThickness: border,
    outerStrokeWidth: thickness + border * 2,
    fullCircle,
    startPoint: getArcPoint(centerX, centerY, radius, angles.startAngle),
    endPoint: getArcPoint(centerX, centerY, radius, angles.endAngle),
    fillEndPoint: getArcPoint(centerX, centerY, radius, angles.startAngle + angles.sweepAngle * fill),
    labelAngles,
  }
}

/**
 * Returns an SVG path for a partial clockwise arc. Full circles should use an
 * SVG `<circle>` instead because one arc command cannot represent them safely.
 */
export function getArcSvgPath({ centerX, centerY, radius, startAngle, sweepAngle }) {
  const safeSweep = Math.max(0, finiteNumber(sweepAngle))
  if (safeSweep <= 0 || finiteNumber(radius) <= 0) return ''

  const start = getArcPoint(centerX, centerY, radius, startAngle)
  const end = getArcPoint(centerX, centerY, radius, finiteNumber(startAngle) + safeSweep)
  const largeArcFlag = safeSweep > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`
}

const ARC_PATH_EPSILON = 0.001
const ARC_QUARTER_CIRCLE_KAPPA = 0.5522847498

function formatArcPathNumber(value) {
  return Number(finiteNumber(value).toFixed(3))
}

function arcPathPoint(centerX, centerY, radius, angle) {
  return getArcPoint(centerX, centerY, radius, angle)
}

function arcPathTangent(angle) {
  const radians = (finiteNumber(angle) * Math.PI) / 180
  return { x: -Math.sin(radians), y: Math.cos(radians) }
}

function arcPathNormal(angle) {
  const radians = (finiteNumber(angle) * Math.PI) / 180
  return { x: Math.cos(radians), y: Math.sin(radians) }
}

function localArcPathPoint(origin, tangent, normal, x, y) {
  return {
    x: origin.x + tangent.x * x + normal.x * y,
    y: origin.y + tangent.y * x + normal.y * y,
  }
}

function pathMove(point) {
  return `M ${formatArcPathNumber(point.x)} ${formatArcPathNumber(point.y)}`
}

function pathLine(point) {
  return `L ${formatArcPathNumber(point.x)} ${formatArcPathNumber(point.y)}`
}

function pathCubic(control1, control2, end) {
  return `C ${formatArcPathNumber(control1.x)} ${formatArcPathNumber(control1.y)} ${formatArcPathNumber(control2.x)} ${formatArcPathNumber(control2.y)} ${formatArcPathNumber(end.x)} ${formatArcPathNumber(end.y)}`
}

function appendCircularArc(commands, centerX, centerY, radius, startAngle, sweepAngle) {
  const segmentCount = Math.max(1, Math.ceil(Math.abs(sweepAngle) / 90))
  const segmentSweep = sweepAngle / segmentCount

  for (let index = 0; index < segmentCount; index += 1) {
    const angle0 = startAngle + segmentSweep * index
    const angle1 = angle0 + segmentSweep
    const controlDistance = radius * ((4 / 3) * Math.tan(((angle1 - angle0) * Math.PI) / 720))
    const end = arcPathPoint(centerX, centerY, radius, angle1)
    const startTangent = arcPathTangent(angle0)
    const endTangent = arcPathTangent(angle1)
    const start = arcPathPoint(centerX, centerY, radius, angle0)
    commands.push(
      pathCubic(
        { x: start.x + startTangent.x * controlDistance, y: start.y + startTangent.y * controlDistance },
        { x: end.x - endTangent.x * controlDistance, y: end.y - endTangent.y * controlDistance },
        end,
      ),
    )
  }
}

function appendOuterToInnerFillet(commands, origin, tangent, normal, halfThickness, cornerRadius) {
  if (cornerRadius <= ARC_PATH_EPSILON) {
    commands.push(pathLine(localArcPathPoint(origin, tangent, normal, 0, -halfThickness)))
    return
  }

  const kappa = cornerRadius * ARC_QUARTER_CIRCLE_KAPPA
  const upperEnd = localArcPathPoint(origin, tangent, normal, cornerRadius, halfThickness - cornerRadius)
  const lowerStart = localArcPathPoint(origin, tangent, normal, cornerRadius, -halfThickness + cornerRadius)
  const innerEnd = localArcPathPoint(origin, tangent, normal, 0, -halfThickness)
  commands.push(
    pathCubic(
      localArcPathPoint(origin, tangent, normal, kappa, halfThickness),
      localArcPathPoint(origin, tangent, normal, cornerRadius, halfThickness - cornerRadius + kappa),
      upperEnd,
    ),
    pathLine(lowerStart),
    pathCubic(
      localArcPathPoint(origin, tangent, normal, cornerRadius, -halfThickness + cornerRadius - kappa),
      localArcPathPoint(origin, tangent, normal, kappa, -halfThickness),
      innerEnd,
    ),
  )
}

function appendInnerToOuterFillet(commands, origin, tangent, normal, halfThickness, cornerRadius) {
  if (cornerRadius <= ARC_PATH_EPSILON) {
    commands.push(pathLine(localArcPathPoint(origin, tangent, normal, 0, halfThickness)))
    return
  }

  const kappa = cornerRadius * ARC_QUARTER_CIRCLE_KAPPA
  const lowerEnd = localArcPathPoint(origin, tangent, normal, cornerRadius, -halfThickness + cornerRadius)
  const upperStart = localArcPathPoint(origin, tangent, normal, cornerRadius, halfThickness - cornerRadius)
  const outerEnd = localArcPathPoint(origin, tangent, normal, 0, halfThickness)
  commands.push(
    pathCubic(
      localArcPathPoint(origin, tangent, normal, kappa, -halfThickness),
      localArcPathPoint(origin, tangent, normal, cornerRadius, -halfThickness + cornerRadius - kappa),
      lowerEnd,
    ),
    pathLine(upperStart),
    pathCubic(
      localArcPathPoint(origin, tangent, normal, cornerRadius, halfThickness - cornerRadius + kappa),
      localArcPathPoint(origin, tangent, normal, kappa, halfThickness),
      outerEnd,
    ),
  )
}

/**
 * Creates one closed, filled arc-track outline. Its endpoint corners are true
 * continuous fillets: 0px is a flat radial face and half the track thickness
 * becomes a semicircular cap. The same cubic construction is used by Skia.
 */
export function getArcFilledTrackPath({ centerX, centerY, radius, startAngle, sweepAngle, trackThickness, cornerRadius = 0 }) {
  const sweep = Math.min(ARC_MAX_ANGLE_DEGREES, Math.max(0, finiteNumber(sweepAngle)))
  const halfThickness = Math.max(0, finiteNumber(trackThickness)) * 0.5
  const outerRadius = finiteNumber(radius) + halfThickness
  const innerRadius = finiteNumber(radius) - halfThickness
  if (sweep <= ARC_PATH_EPSILON || halfThickness <= ARC_PATH_EPSILON || innerRadius <= ARC_PATH_EPSILON) return ''

  const start = finiteNumber(startAngle)
  const outerStart = arcPathPoint(centerX, centerY, outerRadius, start)
  const commands = [pathMove(outerStart)]

  if (sweep >= ARC_MAX_ANGLE_DEGREES - ARC_PATH_EPSILON) {
    appendCircularArc(commands, centerX, centerY, outerRadius, start, ARC_MAX_ANGLE_DEGREES)
    commands.push('Z', pathMove(arcPathPoint(centerX, centerY, innerRadius, start)))
    appendCircularArc(commands, centerX, centerY, innerRadius, start, -ARC_MAX_ANGLE_DEGREES)
    commands.push('Z')
    return commands.join(' ')
  }

  const end = start + sweep
  const endCenter = arcPathPoint(centerX, centerY, radius, end)
  const startCenter = arcPathPoint(centerX, centerY, radius, start)
  const filletRadius = Math.min(halfThickness, Math.max(0, finiteNumber(cornerRadius)))
  appendCircularArc(commands, centerX, centerY, outerRadius, start, sweep)
  appendOuterToInnerFillet(commands, endCenter, arcPathTangent(end), arcPathNormal(end), halfThickness, filletRadius)
  appendCircularArc(commands, centerX, centerY, innerRadius, end, -sweep)
  const startTangent = arcPathTangent(start)
  appendInnerToOuterFillet(commands, startCenter, { x: -startTangent.x, y: -startTangent.y }, arcPathNormal(start), halfThickness, filletRadius)
  commands.push('Z')
  return commands.join(' ')
}

/**
 * Calculates the positions for the value/unit inner widget. Measurements are
 * supplied by the renderer so this function remains pure and unit-testable.
 */
export function getArcInnerWidgetLayout({
  centerX,
  centerY,
  offsetX = 0,
  offsetY = 0,
  fontSize,
  valueMeasure,
  valueVerticalMeasure,
  unitMeasure = null,
  showUnit = false,
}) {
  const valueFontSize = Math.max(0, finiteNumber(fontSize))
  const unitFontSize = Math.max(valueFontSize * ARC_INNER_WIDGET_UNIT_RATIO, ARC_INNER_WIDGET_MIN_UNIT_FONT_SIZE)
  const valueLineHeight = valueFontSize * ARC_INNER_WIDGET_LINE_HEIGHT
  const unitLineHeight = unitFontSize * ARC_INNER_WIDGET_LINE_HEIGHT
  const gap = Math.max(valueFontSize * 0.08, ARC_INNER_WIDGET_GAP_PX)
  const unitVisible = Boolean(showUnit && unitMeasure)
  const groupHeight = unitVisible ? valueLineHeight + gap + unitLineHeight : valueLineHeight
  const groupTop = finiteNumber(centerY) + finiteNumber(offsetY) - groupHeight * 0.5
  const contentCenterX = finiteNumber(centerX) + finiteNumber(offsetX)
  const valueTextMeasure = valueMeasure || {}
  const valueMetrics = valueVerticalMeasure || valueTextMeasure
  const valueGlyphHeight = finiteNumber(valueMetrics.glyphHeight)
  const valueAscent = finiteNumber(valueMetrics.ascent)
  const valueX =
    contentCenterX -
    (finiteNumber(valueTextMeasure.boundsLeft) + finiteNumber(valueTextMeasure.boundsRight, finiteNumber(valueTextMeasure.width))) * 0.5
  const valueBaseline = groupTop + (valueLineHeight - valueGlyphHeight) * 0.5 + valueAscent

  const unit = unitVisible
    ? {
        x: contentCenterX - (finiteNumber(unitMeasure.boundsLeft) + finiteNumber(unitMeasure.boundsRight, finiteNumber(unitMeasure.width))) * 0.5,
        top: groupTop + valueLineHeight + gap,
        baseline:
          groupTop + valueLineHeight + gap + (unitLineHeight - finiteNumber(unitMeasure.glyphHeight)) * 0.5 + finiteNumber(unitMeasure.ascent),
        fontSize: unitFontSize,
        lineHeight: unitLineHeight,
      }
    : null

  return {
    centerX: contentCenterX,
    groupTop,
    groupHeight,
    value: {
      x: valueX,
      top: groupTop,
      baseline: valueBaseline,
      lineHeight: valueLineHeight,
    },
    unit,
  }
}

export function getArcLabelGap(fontSize) {
  return Math.max(finiteNumber(fontSize) * 0.35, ARC_LABEL_GAP_PX)
}
