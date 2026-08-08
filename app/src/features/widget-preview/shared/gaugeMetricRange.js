export function getSemanticGaugeRange(metric) {
  return metric === 'throttle_position' || metric === 'brake_position' ? { min: 0, max: 100 } : null
}
