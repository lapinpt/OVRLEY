import { getPreviewMarkerLayers, percentageToOpacity } from '../../shared/svgPreviewUtils'

/**
 * Builds the presentation model for the route preview renderer.
 *
 * Keeps route styling concerns in one place: viewport dimensions, resolved
 * line widths/colors/opacities, marker styling, and marker inset geometry used
 * during route normalization.
 *
 * Stages:
 * 1. Sanitize viewport dimensions and preview scale.
 * 2. Resolve line styling for both geometry and rendered strokes.
 * 3. Derive marker styling and inset radius for route normalization.
 *
 * @param {object} data - Effective route widget data.
 * @param {number} globalScale - Scene/global scale applied to the preview.
 * @returns {object} Style model consumed by the route preview renderer.
 */
export function getRoutePreviewStyle(data, globalScale) {
  return {
    globalScale,
    remainingLineOpacity: percentageToOpacity(data.remaining_line_opacity),
    completedLineOpacity: percentageToOpacity(data.completed_line_opacity),
    routeMarkerInsetRadius: Math.max(data.marker_size, data.marker_variant_diameter * 0.5),
    markerLayers: getPreviewMarkerLayers(data),
  }
}
