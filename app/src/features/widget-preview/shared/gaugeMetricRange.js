import { getStandardMetricDisplayUnit } from '@/lib/widget/standard-metrics'
import { convertStandardMetricValue } from '../widgets/metric/format'

export function getSemanticGaugeRange(metric) {
  return metric === 'throttle_position' || metric === 'brake_position' ? { min: 0, max: 100 } : null
}

export function resolveGaugeRange(values, metric, manualRange = null) {
  if (Number.isFinite(manualRange?.min) && Number.isFinite(manualRange?.max) && manualRange.min < manualRange.max) return manualRange
  const semanticRange = getSemanticGaugeRange(metric)
  if (semanticRange) return semanticRange
  const finiteValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
  if (finiteValues.length === 0) return { min: 0, max: 100 }
  const min = Math.min(...finiteValues)
  const max = Math.max(...finiteValues)
  return max > min ? { min, max } : { min: 0, max: 100 }
}

/**
 * Converts a canonical telemetry range value for editing in the widget's
 * selected display unit. Gauge ranges themselves are always persisted in
 * canonical telemetry units.
 */
export function gaugeRangeValueToDisplay(metric, value, displayUnit) {
  return convertStandardMetricValue(metric, value, displayUnit ?? getStandardMetricDisplayUnit(metric))
}

/**
 * Inverts the metric's affine display conversion so the editor can persist a
 * manual range in canonical telemetry units. Every currently selectable gauge
 * unit uses an affine conversion (including Celsius/Fahrenheit).
 */
export function gaugeRangeValueToCanonical(metric, value, displayUnit) {
  const unit = displayUnit ?? getStandardMetricDisplayUnit(metric)
  const zero = convertStandardMetricValue(metric, 0, unit)
  const one = convertStandardMetricValue(metric, 1, unit)
  const scale = one - zero
  return scale === 0 ? value : (value - zero) / scale
}
