/** Shared SVG path geometry for rounded gauge tracks. */

export const TRACK_PATH_EPSILON = 0.001

const QUARTER_CIRCLE_KAPPA = 0.5522847498

function formatPathNumber(value) {
  return Number(value.toFixed(6))
}

function localPathPoints(frame, coordinates) {
  const points = []
  for (const [tangentOffset, normalOffset] of coordinates) {
    points.push({
      x: frame.origin.x + frame.tangent.x * tangentOffset + frame.normal.x * normalOffset,
      y: frame.origin.y + frame.tangent.y * tangentOffset + frame.normal.y * normalOffset,
    })
  }
  return points
}

export function pathMove(point) {
  return `M ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`
}

function pathLine(point) {
  return `L ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`
}

export function pathCubic(control1, control2, end) {
  return `C ${formatPathNumber(control1.x)} ${formatPathNumber(control1.y)} ${formatPathNumber(control2.x)} ${formatPathNumber(control2.y)} ${formatPathNumber(end.x)} ${formatPathNumber(end.y)}`
}

function appendTrackFillet(commands, frame, halfThickness, cornerRadius, startNormalDirection) {
  if (cornerRadius <= TRACK_PATH_EPSILON) {
    const [oppositeEdge] = localPathPoints(frame, [[0, -startNormalDirection * halfThickness]])
    commands.push(pathLine(oppositeEdge))
    return
  }

  const kappa = cornerRadius * QUARTER_CIRCLE_KAPPA
  const curvedInset = halfThickness - cornerRadius
  const [controlStart, controlEnd, curveEnd, oppositeStart, oppositeControlStart, oppositeControlEnd, oppositeEnd] = localPathPoints(frame, [
    [kappa, startNormalDirection * halfThickness],
    [cornerRadius, startNormalDirection * (curvedInset + kappa)],
    [cornerRadius, startNormalDirection * curvedInset],
    [cornerRadius, -startNormalDirection * curvedInset],
    [cornerRadius, -startNormalDirection * (curvedInset + kappa)],
    [kappa, -startNormalDirection * halfThickness],
    [0, -startNormalDirection * halfThickness],
  ])
  commands.push(
    pathCubic(controlStart, controlEnd, curveEnd),
    pathLine(oppositeStart),
    pathCubic(oppositeControlStart, oppositeControlEnd, oppositeEnd),
  )
}

/** Appends the advancing cap from the positive-normal edge to the negative-normal edge. */
export function appendOuterToInnerTrackFillet(commands, frame, halfThickness, cornerRadius) {
  appendTrackFillet(commands, frame, halfThickness, cornerRadius, 1)
}

/** Appends the trailing cap from the negative-normal edge to the positive-normal edge. */
export function appendInnerToOuterTrackFillet(commands, frame, halfThickness, cornerRadius) {
  appendTrackFillet(commands, frame, halfThickness, cornerRadius, -1)
}

/** Returns the translated phase while the revealed length is shorter than the minimum cap. */
export function getTranslatedTrackCapReveal({ revealedLength, cornerRadius }) {
  const capLength = cornerRadius * 2
  if (revealedLength <= 0 || cornerRadius <= TRACK_PATH_EPSILON || revealedLength >= capLength) return null

  return { cornerRadius, capOffset: revealedLength - capLength }
}

/** Builds the minimum rounded rectangle translated from `frame.origin` along its tangent. */
export function getTranslatedTrackCapPath({ frame, trackThickness, cornerRadius, capOffset }) {
  const translatedFrame = {
    ...frame,
    origin: {
      x: frame.origin.x + frame.tangent.x * capOffset,
      y: frame.origin.y + frame.tangent.y * capOffset,
    },
  }
  const halfThickness = trackThickness * 0.5
  const [outerEdge] = localPathPoints(translatedFrame, [[0, halfThickness]])
  const commands = [pathMove(outerEdge)]
  appendOuterToInnerTrackFillet(commands, translatedFrame, halfThickness, cornerRadius)
  appendInnerToOuterTrackFillet(
    commands,
    { ...translatedFrame, tangent: { x: -translatedFrame.tangent.x, y: -translatedFrame.tangent.y } },
    halfThickness,
    cornerRadius,
  )
  commands.push('Z')
  return commands.join(' ')
}
