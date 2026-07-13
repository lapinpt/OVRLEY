/**
 * Builds the shared preview model for intrinsic metric-style widgets.
 *
 * Computes the formatted value text, unit text, icon layout, and visual bounds
 * for a metric widget (speed, heartrate, cadence, power, time, temperature) at
 * the given preview time.
 *
 * Boxed display types (heading_tape, linear, arc, corner) are skipped —
 * they use their own presentation-specific preview path driven by display_type.
 *
 * @param {object} params
 * @param {object} params.widget - Widget configuration object.
 * @param {object} params.activity - Activity data with series values.
 * @param {number} params.previewSecond - Current preview time in seconds.
 * @returns {object|null} Preview model with metricLayout, visualBounds, and text values, or null for non-value or boxed widgets.
 */

import { formatStandardMetricDisplay, formatTimeValue } from './formatUtils'
import { getMetricWidgetLayout, getMetricWidgetVisualBounds, getPreviewFontFamily, measurePreviewText } from './textMeasurement'
import { getInterpolatedActivityValue, getInterpolatedTimeValue, NUMERIC_PREVIEW_VERTICAL_METRICS_TEXT } from '@/features/overlay-editor'
import { getStandardMetricDefinition, isStandardMetricWidgetType, isBoxedDisplayType } from '@/lib/widget/standard-metrics'
import { resolveActiveMetricWidgetData } from '@/lib/widget/widget-resolver'

/**
 * Returns the last finite numeric value in a metric series.
 * @param {unknown[]} series - Activity metric samples.
 * @returns {number|null} Last finite value, or null when none exists.
 */
function getLastFiniteValue(series) {
  if (!Array.isArray(series)) {
    return null
  }

  for (let index = series.length - 1; index >= 0; index -= 1) {
    const candidate = Number(series[index])
    if (Number.isFinite(candidate)) {
      return candidate
    }
  }

  return null
}

/** Measures inner gauge text with the bounds convention used by arc geometry. */
function measureArcPreviewText(text, fontSize, fontFamily) {
  const measurement = measurePreviewText(text, fontSize, fontFamily)
  return { ...measurement, boundsLeft: -measurement.boundsLeft }
}

/**
 * Formats current distance, optionally paired with the activity's total distance.
 * @param {object} activity - Activity data containing distance samples.
 * @param {number} previewSecond - Current preview time.
 * @param {object} widgetData - Normalized distance-widget data.
 * @returns {{value: string, units: string}} Formatted distance display.
 */
export function formatDistancePreviewDisplay(activity, previewSecond, widgetData) {
  const currentDistance = getInterpolatedActivityValue(activity, 'distance', previewSecond)
  const current = formatStandardMetricDisplay('distance', currentDistance, widgetData)
  const showFullDistance = widgetData.show_full_distance ?? true

  if (!showFullDistance) {
    return current
  }

  const totalDistance = getLastFiniteValue(activity?.distance)
  if (totalDistance === null) {
    return current
  }

  const total = formatStandardMetricDisplay('distance', totalDistance, {
    ...widgetData,
    show_units: false,
  })

  return {
    value: `${current.value}/${total.value}`,
    units: current.units,
  }
}

/**
 * Builds the text content consumed by boxed gauges that retain the metric
 * value in their frame. Unlike the intrinsic metric model, this deliberately
 * has no icon layout: arc gauges stack value and unit vertically.
 *
 * @param {object} params
 * @param {object} params.widget - Resolved metric widget.
 * @param {object} params.activity - Activity data with metric series.
 * @param {number} params.previewSecond - Current preview time.
 * @returns {{ valueText: string, unitText: string, fontFamily: string, fontSize: number, valueMeasure: object, valueVerticalMeasure: object, unitMeasure: object|null }|null}
 */
export function buildArcGaugeInnerWidgetModel({ widget, activity, previewSecond }) {
  if (!widget || !isStandardMetricWidgetType(widget.type)) {
    return null
  }

  const data = resolveActiveMetricWidgetData(widget.data)
  const formatted =
    widget.type === 'distance'
      ? formatDistancePreviewDisplay(activity, previewSecond, data)
      : formatStandardMetricDisplay(widget.type, getInterpolatedActivityValue(activity, widget.type, previewSecond), data)
  const fontFamily = getPreviewFontFamily(data.font)
  const valueText = `${data.prefix}${formatted.value}${data.suffix}`
  const unitText = data.show_units ? formatted.units : ''
  const valueMeasure = measureArcPreviewText(valueText, data.font_size, fontFamily)
  const valueVerticalMeasure = measureArcPreviewText(
    /^[0-9:.%+-]+$/.test(valueText) ? NUMERIC_PREVIEW_VERTICAL_METRICS_TEXT : valueText,
    data.font_size,
    fontFamily,
  )
  const unitMeasure = unitText ? measureArcPreviewText(unitText, Math.max(data.font_size * 0.28, 12), fontFamily) : null

  return {
    valueText,
    unitText,
    fontFamily,
    fontSize: data.font_size,
    valueMeasure,
    valueVerticalMeasure,
    unitMeasure,
  }
}

/**
 * Builds the formatted layout model for an intrinsic metric widget preview.
 * @param {object} params - Widget and current activity preview state.
 * @returns {object|null} Metric presentation model, or null for unsupported presentations.
 */
export function buildMetricWidgetPreviewModel({ widget, activity, previewSecond }) {
  // Guard — skip non-value widgets and gradient type (handled separately).
  if (!widget || widget.type === 'gradient') {
    return null
  }
  // Boxed display types use their own presentation-specific preview path.
  if (isBoxedDisplayType(widget?.data?.display_type)) {
    return null
  }
  if (widget.category !== 'values' && !isStandardMetricWidgetType(widget.type)) {
    return null
  }

  // Resolve display_variants for non-text display types
  const resolvedData = resolveActiveMetricWidgetData(widget.data)
  const fontSize = resolvedData.font_size ?? 60
  const fontFamily = getPreviewFontFamily(resolvedData.font || resolvedData.font_family)

  // Value formatting — format the interpolated activity value based on widget type (speed, heartrate, cadence, power, time, temperature)
  let valueText = '--'
  let unitText = ''

  if (isStandardMetricWidgetType(widget.type)) {
    const definition = getStandardMetricDefinition(widget.type)
    const formatted =
      widget.type === 'distance'
        ? formatDistancePreviewDisplay(activity, previewSecond, resolvedData)
        : formatStandardMetricDisplay(widget.type, getInterpolatedActivityValue(activity, widget.type, previewSecond), resolvedData)
    valueText = formatted.value
    unitText = formatted.units

    const showUnits = resolvedData.show_units ?? definition?.showUnitsByDefault ?? false
    const showIcon = resolvedData.show_icon ?? true
    const iconSize = resolvedData.icon_size ?? 28
    const metricLayout = getMetricWidgetLayout({
      fontSize,
      fontFamily,
      valueText,
      unitText,
      showIcon,
      showUnits,
      iconSize,
    })

    return {
      fontFamily,
      fontSize,
      iconSize,
      metricLayout,
      showIcon,
      showUnits,
      unitText,
      valueText,
      visualBounds: getMetricWidgetVisualBounds(metricLayout, {
        iconOffsetX: resolvedData.icon_offset_x ?? 0,
        iconOffsetY: resolvedData.icon_offset_y ?? 0,
      }),
    }
  } else if (widget.type === 'time') {
    valueText = formatTimeValue(resolvedData.format || 'time-24', getInterpolatedTimeValue(activity, previewSecond))
  } else {
    return null
  }

  // Layout computation — build icon, value, and units positions via text measurement, then compute visual bounds with icon offsets
  const showUnits = resolvedData.show_units ?? ['speed', 'temperature'].includes(widget.type)
  const showIcon = resolvedData.show_icon ?? true
  const iconSize = resolvedData.icon_size ?? 28
  const metricLayout = getMetricWidgetLayout({
    fontSize,
    fontFamily,
    valueText,
    unitText,
    showIcon,
    showUnits,
    iconSize,
  })

  return {
    fontFamily,
    fontSize,
    iconSize,
    metricLayout,
    showIcon,
    showUnits,
    unitText,
    valueText,
    visualBounds: getMetricWidgetVisualBounds(metricLayout, {
      iconOffsetX: resolvedData.icon_offset_x ?? 0,
      iconOffsetY: resolvedData.icon_offset_y ?? 0,
    }),
  }
}
