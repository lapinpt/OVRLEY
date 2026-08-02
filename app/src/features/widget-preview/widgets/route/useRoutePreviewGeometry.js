import { useState, useEffect, useMemo } from 'react'
import { getDistanceProgressAtElapsed, getPreviewActivity, getWindowProgressAtTime, resolveExportRangeWindow } from '@/features/overlay-editor'
import { buildRouteGeometry, hasTauriRuntime } from '@/api/backend'
import { pointsToSvg } from '@/lib/geometryUtils'
import { buildPlaceholderRoutePreviewGeometry } from '../../shared/plotGeometry'
import { buildRouteFramePreview } from '../../shared/svgPreviewUtils'
import useStore from '@/store/useStore'

/**
 * Builds the geometry model for the route preview renderer.
 *
 * Rust handles the expensive geometry pipeline (Mercator projection,
 * LTTB downsampling, RDP simplification, widget fitting) via IPC.
 * This hook consumes the result and performs cheap per-frame operations
 * locally (marker interpolation, completed segment, SVG paths) that
 * must run at 30fps.
 *
 * For canvas-parity testing, window.__OVRLEY_MOCK_ROUTE_GEOMETRY
 * injects pre-computed Rust geometry so Skia and SVG use identical data.
 *
 * @param {object} params
 * @param {object|null} params.activity - Stable parsed activity used to prepare geometry and display activity data.
 * @param {object} params.data - Effective route widget data.
 * @param {object} params.exportRange - Active export-range selection.
 * @param {number} params.previewSecond - Current preview timestamp in seconds.
 * @param {object} params.style - Style model returned by useRoutePreviewStyle.
 * @returns {object|null} Geometry model for the renderer, or null while loading.
 */
export function useRoutePreviewGeometry({ activity, data, exportRange, previewSecond, style }) {
  const [rustGeometry, setRustGeometry] = useState(null)
  const config = useStore((state) => state.config)
  const globalDefaults = useStore((state) => state.globalDefaults)
  const fallbackDurationSeconds = useStore((state) => state.fallbackDurationSeconds)
  const exportWindow = useMemo(
    () => resolveExportRangeWindow(activity, exportRange, data.show_full_activity),
    [activity, exportRange, data.show_full_activity],
  )

  // Build the config Rust needs. The store scene lacks non-durable fields
  // (scale, shadow, border) — globalDefaults fills them. start/end are
  // overridden when an export window is active so Rust trims source points.
  const geometryConfig = useMemo(() => {
    if (!config || !activity || !hasTauriRuntime()) return null
    const duration = activity.trim_end_seconds
    const { updateRate, start, end, ...sceneRest } = config.scene

    return {
      ...config,
      scene: {
        ...globalDefaults,
        ...sceneRest,
        scale: style.globalScale,
        update_rate: updateRate,
        start: exportWindow.active ? exportWindow.start : (start ?? 0),
        end: exportWindow.active ? exportWindow.end : (end ?? duration),
        custom_export_range_active: exportWindow.active,
      },
    }
  }, [config, globalDefaults, activity, exportWindow, style.globalScale])

  useEffect(() => {
    if (!geometryConfig) return

    if (typeof window !== 'undefined' && window.__OVRLEY_MOCK_ROUTE_GEOMETRY) {
      setRustGeometry(window.__OVRLEY_MOCK_ROUTE_GEOMETRY)
      return
    }

    let cancelled = false
    buildRouteGeometry(geometryConfig, activity).then((geometry) => {
      if (!cancelled) setRustGeometry(geometry)
    })
    return () => {
      cancelled = true
    }
  }, [geometryConfig, activity])

  // Rust computes at scaled resolution (scene.width × scale), but SVG
  // needs unscaled widget-local coordinates.
  const points = useMemo(
    () => (rustGeometry ? rustGeometry.points.map(([x, y]) => [x / style.globalScale, y / style.globalScale]) : null),
    [rustGeometry, style.globalScale],
  )
  const remainingSvgPoints = useMemo(() => (points ? pointsToSvg(points) : null), [points])

  if (getPreviewActivity(activity, previewSecond) === null) {
    return buildPlaceholderRoutePreviewGeometry({
      width: data.width,
      height: data.height,
      previewSecond,
      fallbackDurationSeconds,
    })
  }

  if (!rustGeometry) return null

  // progress01 drives marker placement and completed polyline. Export
  // window normalizes it to 0..1 within the trimmed range.
  const progress01 = exportWindow.active
    ? (getWindowProgressAtTime(activity, exportWindow, previewSecond) ?? 0)
    : getDistanceProgressAtElapsed(activity, previewSecond)

  const { markerPoint, completedPoints } = buildRouteFramePreview(points, rustGeometry.progressValues, progress01)

  return {
    markerPoint,
    remainingSvgPoints,
    completedSvgPoints: pointsToSvg(completedPoints),
  }
}
