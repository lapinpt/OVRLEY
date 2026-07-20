import { useState, useEffect, useMemo } from 'react'
import {
  getDistanceProgressAtElapsed,
  getInterpolatedSeriesValue,
  getWindowProgressAtTime,
  resolveExportRangeWindow,
} from '@/features/overlay-editor'
import { buildElevationGeometry, hasTauriRuntime } from '@/api/backend'
import { areaToSvg, findPointAtProgress, pointsToSvg } from '@/lib/geometryUtils'
import { buildPlaceholderElevationPreviewGeometry } from '../../shared/plotGeometry'
import { buildElevationCompletedPoints } from '../../shared/svgPreviewUtils'
import useStore from '@/store/useStore'

function projectElevationValueToSvgY(elevationValue, dataRange, height, yScale) {
  if (elevationValue === null) return null

  const [minElevation, maxElevation] = dataRange
  const span = Math.max(maxElevation - minElevation, 1e-9)
  const normalized = (elevationValue - minElevation) / span
  const centered = Math.min(Math.max((normalized - 0.5) * yScale + 0.5, 0), 1)

  return height - height * centered
}

/**
 * Builds the geometry model for the elevation preview renderer.
 *
 * Rust handles the expensive geometry pipeline (smoothing, downsampling,
 * projection, RDP simplification) via IPC. This hook consumes the result
 * and performs cheap per-frame operations locally (marker interpolation,
 * completed polyline, SVG paths) that must run at 30fps.
 *
 * For canvas-parity testing, window.__OVRLEY_MOCK_ELEVATION_GEOMETRY
 * injects pre-computed Rust geometry so Skia and SVG use identical data.
 *
 * @param {object} params
 * @param {object} params.activity - Activity data with elevation samples.
 * @param {object} params.data - Effective elevation widget data.
 * @param {object} params.exportRange - Active export-range selection.
 * @param {number} params.previewSecond - Current preview timestamp in seconds.
 * @param {object} params.style - Style model returned by buildElevationPreviewStyle.
 * @returns {object|null} Geometry model for the renderer, or null while loading.
 */
export function useElevationPreviewGeometry({ activity, data, exportRange, previewSecond, style }) {
  const [rustGeometry, setRustGeometry] = useState(null)
  const config = useStore((state) => state.config)
  const globalDefaults = useStore((state) => state.globalDefaults)
  const fallbackDurationSeconds = useStore((state) => state.fallbackDurationSeconds)

  const exportWindow = useMemo(
    () => resolveExportRangeWindow(activity, exportRange, data.show_full_activity),
    [activity, exportRange, data.show_full_activity],
  )

  // Build the config Rust needs. The store scene lacks non-durable fields
  // (scale, shadow, border); globalDefaults fills them. start/end are
  // overridden when an export window is active so Rust trims source points.
  const geometryConfig = useMemo(() => {
    if (!config || !activity || !hasTauriRuntime()) return null
    const duration = activity?.trim_end_seconds ?? 0
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

    if (typeof window !== 'undefined' && window.__OVRLEY_MOCK_ELEVATION_GEOMETRY) {
      setRustGeometry(window.__OVRLEY_MOCK_ELEVATION_GEOMETRY)
      return
    }

    let cancelled = false
    buildElevationGeometry(geometryConfig, activity).then((geometry) => {
      if (!cancelled) setRustGeometry(geometry)
    })
    return () => {
      cancelled = true
    }
  }, [geometryConfig, activity])

  if (!activity) {
    return buildPlaceholderElevationPreviewGeometry({
      width: data.width,
      height: data.height,
      previewSecond,
      fallbackDurationSeconds,
    })
  }

  if (!rustGeometry) return null

  // Rust computes at scaled resolution, but SVG needs widget-local coordinates.
  const points = rustGeometry.points.map(([x, y]) => [x / style.globalScale, y / style.globalScale])

  // Keep marker x distance-based so it stays put during hover/stop segments.
  const progress01 = exportWindow.active
    ? (getWindowProgressAtTime(activity, exportWindow, previewSecond) ?? 0)
    : getDistanceProgressAtElapsed(activity, previewSecond)

  // Completed profile fill is chronological, normalized to the same scoped duration
  // Rust used when building elapsedFractions.
  const sourceDuration = exportWindow.active ? exportWindow.end - exportWindow.start : activity.sample_elapsed_seconds?.at(-1) || 1
  const elapsedWindowStart = exportWindow.active ? exportWindow.start : 0
  const frameElapsedFraction = Math.min(Math.max((previewSecond - elapsedWindowStart) / Math.max(sourceDuration, 1e-9), 0), 1)

  const metricHit = findPointAtProgress(points, rustGeometry.progressValues, progress01)
  const elevationSeries = activity.sample_elevations.length ? activity.sample_elevations : activity.elevation
  const elevationValue = getInterpolatedSeriesValue(activity.sample_elapsed_seconds, elevationSeries, previewSecond)
  const markerY = projectElevationValueToSvgY(elevationValue, rustGeometry.dataRange, data.height, data.y_scale)
  const markerPoint = markerY === null ? null : [metricHit.point[0], markerY]
  const completedPoints = buildElevationCompletedPoints(
    points,
    rustGeometry.progressValues,
    rustGeometry.elapsedFractions,
    progress01,
    frameElapsedFraction,
  )

  return {
    markerPoint,
    elevationValue,
    remainingSvgPoints: pointsToSvg(points),
    completedSvgPoints: pointsToSvg(completedPoints),
    areaSvgPoints: areaToSvg(points, data.width, data.height, null),
    completedAreaSvgPoints: areaToSvg(completedPoints, data.width, data.height, null),
  }
}
