/**
 * Small extraction helpers for frontend raw activity parsers.
 */

const DECIMAL_NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

export function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

export function safeGearValue(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? String(value === 0 ? 0 : value) : null
  if (typeof value !== 'string') throw new TypeError('Gear value must be a number or string')

  const text = value.trim()
  if (!text) return null
  if (['n/a', 'na', 'null'].includes(text.toLowerCase())) return null
  if (!DECIMAL_NUMBER_PATTERN.test(text)) return text
  const numeric = Number(text)
  return Number.isFinite(numeric) ? String(numeric === 0 ? 0 : numeric) : text
}
