import { formatFixedDecimal } from '../metric/format'
import { getMetricSeries } from '@/features/overlay-editor'
import { interpolateNumericSeries, MISSING_SAMPLE_POLICY } from '@/lib/interpolation'

const AXIS_SERIES_KEYS = {
  x: 'g_force_x',
  y: 'g_force_y',
  z: 'g_force_z',
}

function readOrientedSeries(activity, axis, invert) {
  if (!activity) return null
  const key = AXIS_SERIES_KEYS[axis]
  if (!key) throw new Error(`Unknown G-force axis: ${axis}`)
  const values = getMetricSeries(activity, key)
  if (values === undefined) return null
  const multiplier = invert ? -1 : 1
  return values.map((value) => (value === null ? null : value * multiplier))
}

function formatCoordinate(value, decimals) {
  return value === null ? '--' : formatFixedDecimal(value, decimals)
}

/** Prepares oriented activity axes and the whole-activity nearest-rank scale. */
export function prepareGForcePreview(activity, config) {
  const horizontal = readOrientedSeries(activity, config.axis_horizontal, config.invert_horizontal)
  const vertical = readOrientedSeries(activity, config.axis_vertical, config.invert_vertical)
  const components = {
    x: readOrientedSeries(activity, 'x', false),
    y: readOrientedSeries(activity, 'y', false),
    z: readOrientedSeries(activity, 'z', false),
  }
  if (!horizontal || !vertical) {
    return { times: activity?.sample_elapsed_seconds ?? null, horizontal, vertical, components, maxG: 0 }
  }

  const magnitudes = []
  for (let index = 0; index < horizontal.length; index += 1) {
    if (horizontal[index] !== null && vertical[index] !== null) magnitudes.push(Math.hypot(horizontal[index], vertical[index]))
  }
  if (magnitudes.length === 0) return { times: activity.sample_elapsed_seconds, horizontal, vertical, components, maxG: 0 }

  magnitudes.sort((left, right) => left - right)
  const rank = Math.ceil((config.clip_percentile / 100) * magnitudes.length)
  return {
    times: activity.sample_elapsed_seconds,
    horizontal,
    vertical,
    components,
    maxG: magnitudes[Math.max(rank - 1, 0)],
  }
}

/** Builds the current G-force value and marker state from canonical activity series. */
export function buildGForceFrameState(prepared, config, previewSecond, centerX, centerY, radius) {
  const horizontal = interpolateNumericSeries(prepared.times, prepared.horizontal, previewSecond, MISSING_SAMPLE_POLICY.PRESERVE)
  const vertical = interpolateNumericSeries(prepared.times, prepared.vertical, previewSecond, MISSING_SAMPLE_POLICY.PRESERVE)
  const x = interpolateNumericSeries(prepared.times, prepared.components.x, previewSecond, MISSING_SAMPLE_POLICY.PRESERVE)
  const y = interpolateNumericSeries(prepared.times, prepared.components.y, previewSecond, MISSING_SAMPLE_POLICY.PRESERVE)
  const z = interpolateNumericSeries(prepared.times, prepared.components.z, previewSecond, MISSING_SAMPLE_POLICY.PRESERVE)
  const coordinateText = `[${formatCoordinate(horizontal, config.label_decimals)}, ${formatCoordinate(vertical, config.label_decimals)}]`
  const componentText = `X ${formatCoordinate(x, config.label_decimals)}  Y ${formatCoordinate(y, config.label_decimals)}  Z ${formatCoordinate(z, config.label_decimals)}`

  if (horizontal === null || vertical === null) {
    return { markerX: centerX, markerY: centerY, magnitude: null, valueText: '--', unitText: '', coordinateText, componentText }
  }

  const magnitude = Math.hypot(horizontal, vertical)
  let offsetX = 0
  let offsetY = 0
  if (prepared.maxG > 0 && magnitude > 0) {
    const scale = radius / prepared.maxG
    const clamp = magnitude > prepared.maxG ? prepared.maxG / magnitude : 1
    offsetX = horizontal * scale * clamp
    offsetY = vertical * scale * clamp
  }

  return {
    markerX: centerX + offsetX,
    markerY: centerY + offsetY,
    magnitude,
    valueText: formatFixedDecimal(magnitude, config.label_decimals),
    unitText: config.label_unit,
    coordinateText,
    componentText,
  }
}
