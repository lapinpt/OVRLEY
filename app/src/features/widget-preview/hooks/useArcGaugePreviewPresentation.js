import { useMemo } from 'react'
import { getInterpolatedActivityValue } from '@/features/overlay-editor'
import { getArcGaugeLayout, getArcLabelGap, getCornerGaugeLayout } from '../utils/arcGaugeLayout'
import { getArcInnerWidgetLayout } from '../utils/arcGaugeInnerLayout'
import { getArcFilledTrackRevealSpec, getArcPoint } from '../utils/arcTrackPath'
import { buildArcGaugeInnerWidgetModel } from '../utils/metricWidgetPreviewUtils'
import { getTextShadowParts } from '../utils/shadowUtils'
import { getPreviewFontFamily, measurePreviewText } from '../utils/textMeasurement'
import { useFontMetricsVersion } from './useFontMetricsVersion'

/** Returns the SVG text origin that centers measured text around an x-coordinate. */
function centeredTextX(measurement, centerX) {
  return centerX - (measurement.boundsLeft + measurement.boundsRight) * 0.5
}

/** Returns the SVG baseline that centers measured text around a y-coordinate. */
function centeredTextBaseline(measurement, centerY) {
  return centerY + (measurement.ascent - measurement.descent) * 0.5
}

/** Measures arc text using the Skia-compatible left-bound convention. */
function measureArcPreviewText(text, fontSize, fontFamily) {
  const measurement = measurePreviewText(text, fontSize, fontFamily)
  return { ...measurement, boundsLeft: -measurement.boundsLeft }
}

/** Returns measured min/max label positions for an arc layout. */
function getLabelLayout(layout, minLabel, maxLabel, fontFamily, fontSize) {
  const minMeasurement = measureArcPreviewText(minLabel, fontSize, fontFamily)
  const maxMeasurement = measureArcPreviewText(maxLabel, fontSize, fontFamily)
  const labelRadius = layout.radius + layout.trackThickness * 0.5 + layout.borderThickness + getArcLabelGap(fontSize)
  const minAnchor = getArcPoint(layout.centerX, layout.centerY, labelRadius, layout.labelAngles.min)
  const maxAnchor = getArcPoint(layout.centerX, layout.centerY, labelRadius, layout.labelAngles.max)

  return {
    min: { x: centeredTextX(minMeasurement, minAnchor.x), baseline: centeredTextBaseline(minMeasurement, minAnchor.y) },
    max: { x: centeredTextX(maxMeasurement, maxAnchor.x), baseline: centeredTextBaseline(maxMeasurement, maxAnchor.y) },
  }
}

/**
 * Builds all non-JSX presentation state for an arc or corner gauge.
 * @param {object} params - Normalized widget and live preview inputs.
 * @returns {object} Presentation model consumed by the gauge renderer.
 */
export function useArcGaugePreviewPresentation({ widget, activity, previewSecond, globalOpacity, sceneStyle }) {
  const data = widget.data
  const valueFontFamily = getPreviewFontFamily(data.font)
  const labelFontFamily = getPreviewFontFamily(data.min_max_label_font)
  useFontMetricsVersion(valueFontFamily, data.font_size)
  useFontMetricsVersion(labelFontFamily, data.min_max_label_font_size)

  return useMemo(() => {
    const value = getInterpolatedActivityValue(activity, data.value, previewSecond)
    const values = activity?.[data.value] ?? []
    const layout = data.display_type === 'corner' ? getCornerGaugeLayout(data, value, values) : getArcGaugeLayout(data, value, values)
    const trackGeometry = {
      centerX: layout.centerX,
      centerY: layout.centerY,
      radius: layout.radius,
      startAngle: layout.startAngle,
      sweepAngle: layout.sweepAngle,
      trackThickness: layout.trackThickness,
    }
    const innerModel = buildArcGaugeInnerWidgetModel({ widget, activity, previewSecond })
    const opacity = data.opacity * globalOpacity
    const fillEndCornerRadius = data.track_fill_flat ? 0 : data.track_corner_radius
    const fillReveal = getArcFilledTrackRevealSpec({
      ...trackGeometry,
      startCornerRadius: data.track_corner_radius,
      endCornerRadius: fillEndCornerRadius,
      fill: layout.fill,
    })
    const minLabel = `${layout.min}`
    const maxLabel = `${layout.max}`

    return {
      layout,
      trackGeometry,
      innerModel,
      innerLayout: getArcInnerWidgetLayout(data, layout, innerModel),
      opacity,
      fillEndCornerRadius,
      outerCornerRadius: data.track_corner_radius + data.track_border_thickness,
      fillReveal,
      minLabel,
      maxLabel,
      labels: data.show_min_max_labels ? getLabelLayout(layout, minLabel, maxLabel, labelFontFamily, data.min_max_label_font_size) : null,
      labelFontFamily,
      shadow: data.track_border_thickness > 0 ? getTextShadowParts(sceneStyle) : undefined,
      maskPadding: layout.outerStrokeWidth + 1,
    }
  }, [activity, data, globalOpacity, labelFontFamily, previewSecond, sceneStyle, widget])
}
