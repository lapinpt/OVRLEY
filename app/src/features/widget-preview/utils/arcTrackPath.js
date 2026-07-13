/** Low-level SVG path geometry for filled arc tracks and rounded caps. */

import {
  appendTrackFillet,
  getTranslatedTrackCapPath,
  getTranslatedTrackCapReveal,
  pathCubic,
  pathMove,
  TRACK_PATH_EPSILON,
} from './trackPathGeometry'

export const ARC_MAX_ANGLE_DEGREES = 360

/** Returns a point on a screen-space circular arc. */
export function getArcPoint(centerX, centerY, radius, angle) {
  const radians = (angle * Math.PI) / 180
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  }
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

/** Converts arc geometry into the shared translated-cap coordinate frame. */
function getArcTranslatedCapPath({ centerX, centerY, radius, startAngle, sweepAngle, trackThickness, capRadius, capOffset }) {
  const direction = Math.sign(sweepAngle)
  const startTangent = arcPathTangent(startAngle)
  return getTranslatedTrackCapPath({
    frame: {
      origin: getArcPoint(centerX, centerY, radius, startAngle),
      tangent: { x: startTangent.x * direction, y: startTangent.y * direction },
      normal: arcPathNormal(startAngle),
    },
    trackThickness,
    cornerRadius: capRadius,
    capOffset,
  })
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
    return getArcTranslatedCapPath({
      centerX,
      centerY,
      radius,
      startAngle,
      sweepAngle,
      trackThickness,
      capRadius: endCornerRadius,
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

  if (sweepMagnitude >= ARC_MAX_ANGLE_DEGREES - TRACK_PATH_EPSILON) {
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
  appendTrackFillet(commands, endFrame, halfThickness, endFilletRadius, 1)
  appendCircularArc(commands, centerX, centerY, innerRadius, end, -sweepAngle)
  const startTangent = arcPathTangent(startAngle)
  const startFrame = {
    origin: startCenter,
    tangent: { x: -startTangent.x * direction, y: -startTangent.y * direction },
    normal: arcPathNormal(startAngle),
  }
  appendTrackFillet(commands, startFrame, halfThickness, startFilletRadius, -1)
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
 * is a translated rounded rectangle (Option B): the minimum shape allowed by
 * the cap radius, slid backward along the sweep tangent and clipped at the start
 * radial line by the annular track intersection. This keeps the leading corners
 * at the full cap radius at every fill level, so the handoff to the normal
 * arc+cap path above the threshold is seamless.
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
  const fullCircle = sweepMagnitude >= ARC_MAX_ANGLE_DEGREES - TRACK_PATH_EPSILON
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
  if (effectiveEndRadius > TRACK_PATH_EPSILON && !fullCircle && totalSpan > TRACK_PATH_EPSILON) {
    const translatedCap = getTranslatedTrackCapReveal({ revealedLength: availableEndCapLength, cornerRadius: effectiveEndRadius })
    if (translatedCap) {
      return {
        capMode: 'translate',
        ...translatedCap,
      }
    }
  }

  return {
    startAngle: startAngle - direction * startCapAngle,
    sweepAngle: direction * Math.max(TRACK_PATH_EPSILON, revealedSweep - revealedEndCapAngle),
    startCornerRadius: 0,
    endCornerRadius: revealedEndRadius,
  }
}
