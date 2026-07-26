/**
 * Numeric interpolation utilities for activity data series.
 * Provides linear interpolation between sample points for elapsed-time series.
 *
 * Domain-agnostic pure functions extracted from features/overlay-editor.
 */

export const MISSING_SAMPLE_POLICY = Object.freeze({
  BRIDGE: 'bridge',
  PRESERVE: 'preserve',
})

function findNearestPresentSampleIndex(elapsedSeries, values, startIndex, direction) {
  for (let index = startIndex; index >= 0 && index < elapsedSeries.length; index += direction) {
    if (values[index] !== null) return index
  }
  return -1
}

function findFirstIndexAtOrAfter(elapsedSeries, targetSecond, low, high) {
  let left = low
  let right = high
  let result = high
  while (left <= right) {
    const middle = Math.floor((left + right) / 2)
    if (elapsedSeries[middle] >= targetSecond) {
      result = middle
      right = middle - 1
    } else {
      left = middle + 1
    }
  }
  return result
}

function interpolatePreservingMissing(elapsedSeries, values, targetSecond) {
  if (targetSecond <= elapsedSeries[0]) return values[0]
  const lastIndex = elapsedSeries.length - 1
  if (targetSecond >= elapsedSeries[lastIndex]) return values[lastIndex]

  const rightIndex = findFirstIndexAtOrAfter(elapsedSeries, targetSecond, 0, lastIndex)
  if (elapsedSeries[rightIndex] === targetSecond) return values[rightIndex]
  const leftIndex = rightIndex - 1
  const leftValue = values[leftIndex]
  const rightValue = values[rightIndex]
  if (leftValue === null || rightValue === null) return null

  const ratio = (targetSecond - elapsedSeries[leftIndex]) / (elapsedSeries[rightIndex] - elapsedSeries[leftIndex])
  return leftValue + (rightValue - leftValue) * ratio
}

function interpolateBridgingMissing(elapsedSeries, values, targetSecond) {
  const firstValidIndex = findNearestPresentSampleIndex(elapsedSeries, values, 0, 1)
  if (firstValidIndex === -1) return null
  const lastValidIndex = findNearestPresentSampleIndex(elapsedSeries, values, values.length - 1, -1)
  if (targetSecond <= elapsedSeries[firstValidIndex]) return values[firstValidIndex]
  if (targetSecond >= elapsedSeries[lastValidIndex]) return values[lastValidIndex]

  const insertionIndex = findFirstIndexAtOrAfter(elapsedSeries, targetSecond, firstValidIndex, lastValidIndex)
  const rightIndex = findNearestPresentSampleIndex(elapsedSeries, values, insertionIndex, 1)
  const leftIndex = findNearestPresentSampleIndex(elapsedSeries, values, elapsedSeries[rightIndex] === targetSecond ? rightIndex : rightIndex - 1, -1)
  if (rightIndex === leftIndex || elapsedSeries[rightIndex] === elapsedSeries[leftIndex]) return values[leftIndex]

  const ratio = (targetSecond - elapsedSeries[leftIndex]) / (elapsedSeries[rightIndex] - elapsedSeries[leftIndex])
  return values[leftIndex] + (values[rightIndex] - values[leftIndex]) * ratio
}

/**
 * Interpolates a numeric series at the target time.
 *
 * @param {number[]} elapsedSeries - Sample elapsed seconds.
 * @param {(number|null)[]} values - Numeric series aligned with elapsed samples.
 * @param {number} targetSecond - Requested elapsed second.
 * @param {'bridge'|'preserve'} [missingSamplePolicy='bridge'] - Whether interpolation may bridge null samples.
 * @returns {number|null} Interpolated numeric value.
 */
export function interpolateNumericSeries(elapsedSeries, values, targetSecond, missingSamplePolicy = MISSING_SAMPLE_POLICY.BRIDGE) {
  if (elapsedSeries === null || values === null || elapsedSeries.length === 0 || values.length === 0) return null
  if (missingSamplePolicy === MISSING_SAMPLE_POLICY.PRESERVE) {
    return interpolatePreservingMissing(elapsedSeries, values, targetSecond)
  }
  if (missingSamplePolicy === MISSING_SAMPLE_POLICY.BRIDGE) {
    return interpolateBridgingMissing(elapsedSeries, values, targetSecond)
  }
  throw new Error(`Unknown missing sample policy: ${missingSamplePolicy}`)
}

/**
 * Interpolates a course point (lat/lng pair) at the target time.
 *
 * @param {number[]} elapsedSeries - Sample elapsed seconds.
 * @param {number[][]} coursePoints - Course point series aligned with elapsed samples.
 * @param {number} targetSecond - Requested elapsed second.
 * @returns {number[]|null} Interpolated [latitude, longitude] or null.
 */
export function interpolateCoursePoint(elapsedSeries, coursePoints, targetSecond) {
  const latitudes = coursePoints.map((point) => (Array.isArray(point) ? point[0] : null))
  const longitudes = coursePoints.map((point) => (Array.isArray(point) ? point[1] : null))
  const latitude = interpolateNumericSeries(elapsedSeries, latitudes, targetSecond)
  const longitude = interpolateNumericSeries(elapsedSeries, longitudes, targetSecond)

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null
  }

  return [latitude, longitude]
}

/**
 * Checks whether two course points are equal.
 *
 * @param {number[]} left - Left-hand point.
 * @param {number[]} right - Right-hand point.
 * @returns {boolean} Whether the points match.
 */
export function coursePointsEqual(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left[0] === right[0] && left[1] === right[1]
}
