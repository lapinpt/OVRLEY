/** Low-level SVG path geometry for filled arc tracks and rounded caps. */

export const ARC_MAX_ANGLE_DEGREES = 360

const ARC_PATH_EPSILON = 0.001
const ARC_QUARTER_CIRCLE_KAPPA = 0.5522847498

/** Returns a point on a screen-space circular arc. */
export function getArcPoint(centerX, centerY, radius, angle) {
  const radians = (angle * Math.PI) / 180
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  }
}

/** Formats a path coordinate without losing small fill segments. */
function formatArcPathNumber(value) {
  return Number(value.toFixed(6))
}

/** Returns the unit tangent for an arc angle. */
function arcPathTangent(angle) {
  const radians = (angle * Math.PI) / 180
  return { x: -Math.sin(radians), y: Math.cos(radians) }
}

/** Returns the unit normal for an arc angle. */
function arcPathNormal(angle) {
  const radians = (angle * Math.PI) / 180
  return { x: Math.cos(radians), y: Math.sin(radians) }
}

/** Converts local tangent/normal coordinates to SVG coordinates. */
function localArcPathPoints(frame, coordinates) {
  const points = []
  for (const [tangentOffset, normalOffset] of coordinates) {
    points.push({
      x: frame.origin.x + frame.tangent.x * tangentOffset + frame.normal.x * normalOffset,
      y: frame.origin.y + frame.tangent.y * tangentOffset + frame.normal.y * normalOffset,
    })
  }
  return points
}

/** Serializes an SVG move command. */
function pathMove(point) {
  return `M ${formatArcPathNumber(point.x)} ${formatArcPathNumber(point.y)}`
}

/** Serializes an SVG line command. */
function pathLine(point) {
  return `L ${formatArcPathNumber(point.x)} ${formatArcPathNumber(point.y)}`
}

/** Serializes an SVG cubic Bézier command. */
function pathCubic(control1, control2, end) {
  return `C ${formatArcPathNumber(control1.x)} ${formatArcPathNumber(control1.y)} ${formatArcPathNumber(control2.x)} ${formatArcPathNumber(control2.y)} ${formatArcPathNumber(end.x)} ${formatArcPathNumber(end.y)}`
}

/** Appends cubic Bézier segments approximating a circular arc. */
function appendCircularArc(commands, centerX, centerY, radius, startAngle, sweepAngle) {
  const segmentCount = Math.max(1, Math.ceil(Math.abs(sweepAngle) / 90))
  const segmentSweep = sweepAngle / segmentCount

  for (let index = 0; index < segmentCount; index += 1) {
    const angle0 = startAngle + segmentSweep * index
    const angle1 = angle0 + segmentSweep
    const controlDistance = radius * ((4 / 3) * Math.tan(((angle1 - angle0) * Math.PI) / 720))
    const end = getArcPoint(centerX, centerY, radius, angle1)
    const startTangent = arcPathTangent(angle0)
    const endTangent = arcPathTangent(angle1)
    const start = getArcPoint(centerX, centerY, radius, angle0)
    const startControl = { x: start.x + startTangent.x * controlDistance, y: start.y + startTangent.y * controlDistance }
    const endControl = { x: end.x - endTangent.x * controlDistance, y: end.y - endTangent.y * controlDistance }
    commands.push(pathCubic(startControl, endControl, end))
  }
}

/** Appends the end cap from the outer edge to the inner edge. */
function appendOuterToInnerFillet(commands, frame, halfThickness, cornerRadius) {
  if (cornerRadius <= ARC_PATH_EPSILON) {
    const [innerEdge] = localArcPathPoints(frame, [[0, -halfThickness]])
    commands.push(pathLine(innerEdge))
    return
  }

  const kappa = cornerRadius * ARC_QUARTER_CIRCLE_KAPPA
  const [upperControlStart, upperControlEnd, upperEnd, lowerStart, lowerControlStart, lowerControlEnd, innerEnd] = localArcPathPoints(frame, [
    [kappa, halfThickness],
    [cornerRadius, halfThickness - cornerRadius + kappa],
    [cornerRadius, halfThickness - cornerRadius],
    [cornerRadius, -halfThickness + cornerRadius],
    [cornerRadius, -halfThickness + cornerRadius - kappa],
    [kappa, -halfThickness],
    [0, -halfThickness],
  ])
  const upperCurve = pathCubic(upperControlStart, upperControlEnd, upperEnd)
  const connector = pathLine(lowerStart)
  const lowerCurve = pathCubic(lowerControlStart, lowerControlEnd, innerEnd)
  commands.push(upperCurve, connector, lowerCurve)
}

/** Appends the start cap from the inner edge to the outer edge. */
function appendInnerToOuterFillet(commands, frame, halfThickness, cornerRadius) {
  if (cornerRadius <= ARC_PATH_EPSILON) {
    const [outerEdge] = localArcPathPoints(frame, [[0, halfThickness]])
    commands.push(pathLine(outerEdge))
    return
  }

  const kappa = cornerRadius * ARC_QUARTER_CIRCLE_KAPPA
  const [lowerControlStart, lowerControlEnd, lowerEnd, upperStart, upperControlStart, upperControlEnd, outerEnd] = localArcPathPoints(frame, [
    [kappa, -halfThickness],
    [cornerRadius, -halfThickness + cornerRadius - kappa],
    [cornerRadius, -halfThickness + cornerRadius],
    [cornerRadius, halfThickness - cornerRadius],
    [cornerRadius, halfThickness - cornerRadius + kappa],
    [kappa, halfThickness],
    [0, halfThickness],
  ])
  const lowerCurve = pathCubic(lowerControlStart, lowerControlEnd, lowerEnd)
  const connector = pathLine(upperStart)
  const upperCurve = pathCubic(upperControlStart, upperControlEnd, outerEnd)
  commands.push(lowerCurve, connector, upperCurve)
}

/**
 * Builds a closed filled disk used as the low-fill clip (Option B). The disk is
 * centered on the track centerline at `capOffset` along the sweep tangent from
 * the start. Sliding the disk backward (negative capOffset) hides it behind the
 * start edge; at capOffset = 0 its front half sits inside the track annulus and
 * reads as the fully-formed end cap. Intersecting this disk with the annular
 * track clip produces a crescent that grows monotonically with fill.
 * @param {object} params - Track geometry, disk radius, and tangential offset.
 * @returns {string} Closed SVG disk path, or '' when degenerate.
 */
function buildTranslatedCapPath({ centerX, centerY, radius, startAngle, sweepAngle, trackThickness, capRadius, capOffset }) {
  const direction = Math.sign(sweepAngle)
  if (direction === 0 || capRadius <= ARC_PATH_EPSILON) return ''

  const r = Math.min(trackThickness * 0.5, capRadius)
  if (r <= ARC_PATH_EPSILON) return ''

  const startCenter = getArcPoint(centerX, centerY, radius, startAngle)
  const sweepForward = (() => {
    const t = arcPathTangent(startAngle)
    return { x: t.x * direction, y: t.y * direction }
  })()

  const capCenter = {
    x: startCenter.x + sweepForward.x * capOffset,
    y: startCenter.y + sweepForward.y * capOffset,
  }

  const commands = [pathMove(getArcPoint(capCenter.x, capCenter.y, r, 0))]
  appendCircularArc(commands, capCenter.x, capCenter.y, r, 0, ARC_MAX_ANGLE_DEGREES)
  commands.push('Z')
  return commands.join(' ')
}

/**
 * Creates one closed filled arc-track outline with independently rounded caps.
 * @param {object} geometry - Arc centerline, thickness, and cap geometry.
 * @returns {string} Closed SVG path.
 */
export function getArcFilledTrackPath({
  centerX,
  centerY,
  radius,
  startAngle,
  sweepAngle,
  trackThickness,
  cornerRadius = 0,
  startCornerRadius = cornerRadius,
  endCornerRadius = cornerRadius,
  capMode,
  capOffset = 0,
}) {
  if (capMode === 'translate') {
    return buildTranslatedCapPath({
      centerX,
      centerY,
      radius,
      startAngle,
      sweepAngle,
      trackThickness,
      capRadius: endCornerRadius || cornerRadius,
      capOffset,
    })
  }

  const sweepMagnitude = Math.abs(sweepAngle)
  const direction = Math.sign(sweepAngle)
  const halfThickness = trackThickness * 0.5
  const outerRadius = radius + halfThickness
  const innerRadius = radius - halfThickness
  if (sweepMagnitude === 0) return ''

  const commands = [pathMove(getArcPoint(centerX, centerY, outerRadius, startAngle))]

  if (sweepMagnitude >= ARC_MAX_ANGLE_DEGREES - ARC_PATH_EPSILON) {
    appendCircularArc(commands, centerX, centerY, outerRadius, startAngle, direction * ARC_MAX_ANGLE_DEGREES)
    commands.push('Z', pathMove(getArcPoint(centerX, centerY, innerRadius, startAngle)))
    appendCircularArc(commands, centerX, centerY, innerRadius, startAngle, -direction * ARC_MAX_ANGLE_DEGREES)
    commands.push('Z')
    return commands.join(' ')
  }

  const end = startAngle + sweepAngle
  const endCenter = getArcPoint(centerX, centerY, radius, end)
  const startCenter = getArcPoint(centerX, centerY, radius, startAngle)
  const startFilletRadius = Math.min(halfThickness, startCornerRadius)
  const endFilletRadius = Math.min(halfThickness, endCornerRadius)
  appendCircularArc(commands, centerX, centerY, outerRadius, startAngle, sweepAngle)
  const endTangent = arcPathTangent(end)
  const endFrame = {
    origin: endCenter,
    tangent: { x: endTangent.x * direction, y: endTangent.y * direction },
    normal: arcPathNormal(end),
  }
  appendOuterToInnerFillet(commands, endFrame, halfThickness, endFilletRadius)
  appendCircularArc(commands, centerX, centerY, innerRadius, end, -sweepAngle)
  const startTangent = arcPathTangent(startAngle)
  const startFrame = {
    origin: startCenter,
    tangent: { x: -startTangent.x * direction, y: -startTangent.y * direction },
    normal: arcPathNormal(startAngle),
  }
  appendInnerToOuterFillet(commands, startFrame, halfThickness, startFilletRadius)
  commands.push('Z')
  return commands.join(' ')
}

/** Returns the angular span of a rounded arc cap. */
function arcCapAngle(radius, cornerRadius) {
  return cornerRadius > 0 ? (Math.atan2(cornerRadius, radius) * 180) / Math.PI : 0
}

/**
 * Builds clip geometry that reveals a fill from the track's actual start edge.
 *
 * Below a threshold fill (where the end cap is not yet fully formed), the clip
 * is a translated rounded cap (Option B): the same cap shape used by the normal
 * path, slid backward along the sweep tangent and clipped at the start radial
 * line by the annular track intersection. This keeps the leading edge a true
 * circular arc of the full cap radius at every fill level, so the handoff to the
 * normal arc+cap path above the threshold is seamless.
 * @param {object} geometry - Track geometry and fill fraction.
 * @returns {object|null} Reveal path overrides, or null for an empty fill.
 */
export function getArcFilledTrackRevealSpec({
  radius,
  startAngle,
  sweepAngle,
  trackThickness = 0,
  startCornerRadius = 0,
  endCornerRadius = startCornerRadius,
  fill,
}) {
  if (fill === 0) return null

  const sweepMagnitude = Math.abs(sweepAngle)
  const direction = Math.sign(sweepAngle)
  const fullCircle = sweepMagnitude >= ARC_MAX_ANGLE_DEGREES - ARC_PATH_EPSILON
  const startRadius = fullCircle ? 0 : startCornerRadius
  const endRadius = fullCircle ? 0 : endCornerRadius
  const startCapAngle = arcCapAngle(radius, startRadius)
  const endCapAngle = arcCapAngle(radius, endRadius)
  const totalSpan = sweepMagnitude + startCapAngle + endCapAngle
  const revealedSweep = totalSpan * fill
  const availableEndCapLength = radius * ((revealedSweep * Math.PI) / 180)
  const revealedEndRadius = Math.min(endRadius, availableEndCapLength)
  const revealedEndCapAngle = arcCapAngle(radius, revealedEndRadius)

  const effectiveEndRadius = Math.min(trackThickness * 0.5, endRadius)
  if (effectiveEndRadius > ARC_PATH_EPSILON && !fullCircle && totalSpan > ARC_PATH_EPSILON) {
    const capDiameterAngularLength = (2 * effectiveEndRadius * 180) / (radius * Math.PI)
    const thresholdFill = capDiameterAngularLength / totalSpan
    if (fill < thresholdFill) {
      const phase = fill / thresholdFill
      return {
        capMode: 'translate',
        cornerRadius: effectiveEndRadius,
        capOffset: -2 * effectiveEndRadius * (1 - phase),
      }
    }
  }

  return {
    startAngle: startAngle - direction * startCapAngle,
    sweepAngle: direction * Math.max(ARC_PATH_EPSILON, revealedSweep - revealedEndCapAngle),
    startCornerRadius: 0,
    endCornerRadius: revealedEndRadius,
  }
}
