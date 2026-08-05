/**
 * Pure helper functions for scene settings — sanitization and time parsing.
 */

export { timeToSeconds } from '@/features/overlay-editor/utils/exportRange'

export function sanitizeNumber(val) {
  if (val === undefined || val === null) return val
  const sanitized = val
    .toString()
    .replace(/,/g, '')
    .replace(/^0+(?!$)/, '')
  return parseInt(sanitized, 10) || 0
}

/**
 * Parses a time offset string into seconds. Supports plain seconds, MM:SS, and HH:MM:SS formats.
 *
 * @param {string} value - Time offset string.
 * @returns {number} Offset in seconds.
 */
export function parseTimeOffset(value) {
  if (!value) return 0
  const str = String(value).trim()
  if (str === '') return 0

  const isNegative = str.startsWith('-')
  const absStr = isNegative ? str.substring(1) : str

  if (absStr.includes(':')) {
    const parts = absStr.split(':')
    let seconds = 0
    if (parts.length === 2) {
      seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1])
    } else if (parts.length === 3) {
      seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
    }
    return isNegative ? -seconds : seconds
  }

  const parsed = parseFloat(str)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Formats a video creation timestamp according to its authoritative source.
 * GPS timestamps are converted into the recording timezone; ffprobe timestamps
 * retain their container clock text and only lose the UTC marker.
 *
 * @param {string|null} timestamp - Canonical RFC 3339 timestamp.
 * @param {string|null} source - Timestamp source.
 * @param {string|null} timezone - IANA timezone for GPS timestamps.
 * @returns {string} Display-formatted timestamp.
 */
export function formatVideoCreationTime(timestamp, source, timezone) {
  if (!timestamp) return 'Unknown'

  if (source === 'gps' && timezone) {
    const date = new Date(timestamp)
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`
  }

  return timestamp
    .replace('T', ' ')
    .replace(/\.\d+(?=(?:Z|[+-]\d{2}:?\d{2}| UTC)?$)/, '')
    .replace(/(?:Z|[+-]\d{2}:?\d{2}| UTC)$/, '')
    .trim()
}
