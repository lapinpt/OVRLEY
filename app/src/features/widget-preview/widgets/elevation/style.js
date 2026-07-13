import { getPreviewFontFamily } from '../../shared/textMeasurement'
import { getPreviewMarkerLayers, percentageToOpacity } from '../../shared/svgPreviewUtils'

/**
 * Builds the style model for the elevation preview renderer.
 *
 * Pure computation — derives SVG-facing style values from widget data:
 * scale-adjusted stroke widths, normalized opacities, marker styling,
 * and resolved point-label font settings.
 *
 * @param {object} data - Effective elevation widget data.
 * @param {number} globalScale - Scene/global scale applied to the preview.
 * @returns {object} Style model consumed by the elevation preview renderer.
 */
export function buildElevationPreviewStyle(data, globalScale) {
  return {
    globalScale,
    remainingLineOpacity: percentageToOpacity(data.remaining_line_opacity),
    completedLineOpacity: percentageToOpacity(data.completed_line_opacity),
    markerLayers: getPreviewMarkerLayers(data),
    labelFontFamily: getPreviewFontFamily(data.point_label.font),
    remainingAreaOpacity: percentageToOpacity(data.area_remaining_opacity),
    completedAreaOpacity: percentageToOpacity(data.area_completed_opacity),
  }
}
