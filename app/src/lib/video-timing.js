/**
 * Reports whether a video interval overlaps the activity interval.
 *
 * @param {object} options Timing inputs.
 * @param {number} options.videoStart Timeline second where the video interval starts.
 * @param {number} options.videoDuration Video interval duration in seconds.
 * @param {number} [options.activityEnd=Infinity] Activity interval end in seconds.
 * @returns {boolean} Whether the half-open intervals overlap.
 */
export function videoOverlapsActivity({ videoStart, videoDuration, activityEnd = Number.POSITIVE_INFINITY }) {
  return videoStart < activityEnd && videoStart + videoDuration > 0
}
