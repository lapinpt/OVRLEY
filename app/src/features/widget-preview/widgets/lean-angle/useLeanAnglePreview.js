import { useId, useMemo } from 'react'
import { getInterpolatedActivityValue } from '@/features/overlay-editor'
import { formatStandardMetricDisplay } from '../metric/format'
import { getTextShadowParts } from '../../shared/shadow'
import { getMetricWidgetLayout, getPreviewFontFamily } from '../../shared/textMeasurement'
import { useFontMetricsVersion } from '../../shared/useFontMetrics'
import { getLeanAngleFillPath, getLeanAngleFillSweep, getLeanAngleGeometry, getLeanAngleInnerTrackPath, getLeanAngleOuterTrackPath } from './geometry'

const DEGREE_UNIT_CENTERING_OFFSET_RATIO = 0.1

/**
 * Builds the lean-angle preview presentation for the current activity frame.
 * @param {{widget: object, activity: object|null, previewSecond: number, globalOpacity: number, sceneStyle: object|null}} params
 * @returns {object} Presentation model consumed by the lean-angle renderer.
 */
export function useLeanAnglePreview({ widget, activity, previewSecond, globalOpacity, sceneStyle }) {
  const maskId = useId()
  const fontFamily = getPreviewFontFamily(widget.data.font)
  useFontMetricsVersion(fontFamily, widget.data.font_size)

  return useMemo(() => {
    const geometry = getLeanAngleGeometry(widget.data)
    const raw = getInterpolatedActivityValue(activity, 'lean_angle', previewSecond)
    const missing = raw === null || raw === undefined
    const formatted = formatStandardMetricDisplay('lean_angle', missing ? null : Math.abs(raw), {
      ...widget.data,
      decimals: 0,
    })
    const unitText = missing || !widget.data.show_units ? '' : formatted.units
    const textLayout = getMetricWidgetLayout({
      fontSize: widget.data.font_size,
      fontFamily,
      valueText: formatted.value,
      unitText,
      showIcon: false,
      showUnits: Boolean(unitText),
      iconSize: 0,
    })
    const degreeUnitOffset = unitText ? widget.data.font_size * DEGREE_UNIT_CENTERING_OFFSET_RATIO : 0
    const textOriginX = geometry.centerX + widget.data.value_offset_x + degreeUnitOffset - textLayout.width / 2
    const textOriginY = geometry.centerY + widget.data.value_offset_y - textLayout.height / 2

    return {
      maskId,
      innerTrackClipId: `${maskId}-inner-track`,
      shadow: getTextShadowParts(sceneStyle),
      shadowFilterId: `lean-angle-${widget.id}-shadow`,
      valueShadowFilterId: `lean-angle-${widget.id}-value-shadow`,
      unitShadowFilterId: `lean-angle-${widget.id}-unit-shadow`,
      outerTrackPath: getLeanAngleOuterTrackPath(geometry),
      innerTrackPath: getLeanAngleInnerTrackPath(geometry, widget.data.track_border_thickness),
      fillPath: getLeanAngleFillPath(geometry, raw, widget.data.track_border_thickness),
      fillSweep: getLeanAngleFillSweep(raw),
      opacity: widget.data.opacity * globalOpacity,
      valueText: formatted.value,
      unitText,
      fontFamily,
      textLayout,
      textOriginX,
      textOriginY,
    }
  }, [activity, fontFamily, globalOpacity, previewSecond, sceneStyle, widget])
}
