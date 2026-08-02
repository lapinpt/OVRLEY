import { getRoutePreviewStyle } from './style'
import { useRoutePreviewGeometry } from './useRoutePreviewGeometry'

/**
 * Builds the preview model consumed by the route preview renderer.
 *
 * Coordinates style (pure computation) and geometry (async hook) into
 * a single preview model for the renderer.
 *
 * @param {object} params
 * @param {object} params.widget - Widget configuration object.
 * @param {object|null} params.activity - Stable parsed activity used to prepare geometry and display activity data.
 * @param {number} params.previewSecond - Current preview time in seconds.
 * @param {number} params.globalScale - Global scale multiplier.
 * @param {object} params.exportRange - Export range configuration.
 * @returns {object|null} Preview model for the renderer, or null while loading.
 */
export function useRoutePreview({ widget, activity, previewSecond, globalScale, exportRange }) {
  const style = getRoutePreviewStyle(widget.data, globalScale)
  const geometry = useRoutePreviewGeometry({ activity, data: widget.data, exportRange, previewSecond, style })

  if (!geometry) return null

  return { style, geometry }
}
