/**
 * Arc gauge SVG preview.
 *
 * Mirrors the Skia arc-gauge renderer: the empty stroked track, border,
 * min/max labels, and unit form the static presentation; the filled arc and
 * value text change with the current preview frame. Arc gauges intentionally
 * render no metric icon.
 */

import { useId } from 'react'
import { getArcFilledTrackPath, getArcGaugeLayout, getArcInnerWidgetLayout, getArcLabelGap, getArcPoint } from '../utils/arcGaugeGeometry'
import { buildArcGaugeInnerWidgetModel } from '../utils/metricWidgetPreviewUtils'
import { getTextShadowParts } from '../utils/shadowUtils'
import { normalizeSvgShadowColor, sanitizeSvgId } from '../utils/svgPreviewUtils'
import { getPreviewFontFamily, measurePreviewText } from '../utils/textMeasurement'
import { getInterpolatedActivityValue, NUMERIC_PREVIEW_VERTICAL_METRICS_TEXT } from '@/features/overlay-editor'
import { useFontMetricsVersion } from '../hooks/useFontMetricsVersion'
import { PreviewSvgShadowBlurFilter, PreviewSvgText } from './previewSvgComponents'

function seriesForWidget(activity, widget) {
  const key = widget?.data?.value || widget?.type
  return Array.isArray(activity?.[key]) ? activity[key] : []
}

function centeredTextX(measurement, centerX) {
  return centerX - ((measurement.boundsLeft ?? 0) + (measurement.boundsRight ?? measurement.width ?? 0)) * 0.5
}

function centeredTextBaseline(measurement, centerY) {
  return centerY + ((measurement.ascent ?? 0) - (measurement.descent ?? 0)) * 0.5
}

// Canvas exposes `actualBoundingBoxLeft` as a positive distance to the left
// of the text origin. Skia exposes the equivalent value as the signed left
// edge of its bounds. Arc gauge geometry mirrors the Skia renderer, so adapt
// only these preview measurements before using its centering formula.
function measureArcPreviewText(text, fontSize, fontFamily) {
  const measurement = measurePreviewText(text, fontSize, fontFamily)
  return {
    ...measurement,
    boundsLeft: -(measurement.boundsLeft ?? 0),
  }
}

function labelLayout(layout, minLabel, maxLabel, fontFamily, fontSize) {
  const minMeasurement = measureArcPreviewText(minLabel, fontSize, fontFamily)
  const maxMeasurement = measureArcPreviewText(maxLabel, fontSize, fontFamily)
  const labelRadius = layout.radius + layout.trackThickness * 0.5 + layout.borderThickness + getArcLabelGap(fontSize)
  const minAnchor = getArcPoint(layout.centerX, layout.centerY, labelRadius, layout.labelAngles.min)
  const maxAnchor = getArcPoint(layout.centerX, layout.centerY, labelRadius, layout.labelAngles.max)

  return {
    min: {
      x: centeredTextX(minMeasurement, minAnchor.x),
      baseline: centeredTextBaseline(minMeasurement, minAnchor.y),
    },
    max: {
      x: centeredTextX(maxMeasurement, maxAnchor.x),
      baseline: centeredTextBaseline(maxMeasurement, maxAnchor.y),
    },
  }
}

function ArcTrackPath({ d, fill, fillOpacity = 1, mask, dataTestId }) {
  if (!d) return null
  const trackPath = <path data-testid={dataTestId} d={d} fill={fill} fillOpacity={fillOpacity} fillRule="evenodd" />
  return mask ? <g mask={mask}>{trackPath}</g> : trackPath
}

export function OverlayArcGaugeWidget({ widget, activity, previewSecond, globalOpacity = 1, globalScale = 1, sceneStyle }) {
  const data = widget.data
  const generatedId = useId()
  const valueFontFamily = getPreviewFontFamily(data.font || data.font_family)
  const valueFontSize = data.font_size ?? 60
  const labelFontFamily = getPreviewFontFamily(data.min_max_label_font)
  const labelFontSize = data.min_max_label_font_size ?? 12
  useFontMetricsVersion(valueFontFamily, valueFontSize)
  useFontMetricsVersion(labelFontFamily, labelFontSize)

  if (data.display_type !== 'arc') return null

  const width = data.width
  const height = data.height
  const scale = globalScale || 1
  const trackThickness = data.track_thickness ?? 12
  const borderThickness = data.track_border_thickness ?? 0
  const values = seriesForWidget(activity, widget)
  const value = getInterpolatedActivityValue(activity, data.value || widget.type, previewSecond)
  const layout = getArcGaugeLayout({
    value,
    values,
    width,
    height,
    arcAngle: data.arc_angle,
    trackThickness,
    borderThickness,
  })
  const innerModel = buildArcGaugeInnerWidgetModel({ widget, activity, previewSecond })
  if (!innerModel) return null

  const opacity = (data.opacity ?? 1) * globalOpacity
  const trackCornerRadius = Math.min(layout.trackThickness * 0.5, Math.max(0, Number(data.track_corner_radius) || 0))
  const outerTrackThickness = layout.outerStrokeWidth
  const outerCornerRadius = trackCornerRadius + borderThickness
  const trackPath = getArcFilledTrackPath({
    centerX: layout.centerX,
    centerY: layout.centerY,
    radius: layout.radius,
    startAngle: layout.startAngle,
    sweepAngle: layout.sweepAngle,
    trackThickness: layout.trackThickness,
    cornerRadius: trackCornerRadius,
  })
  const outerTrackPath = getArcFilledTrackPath({
    centerX: layout.centerX,
    centerY: layout.centerY,
    radius: layout.radius,
    startAngle: layout.startAngle,
    sweepAngle: layout.sweepAngle,
    trackThickness: outerTrackThickness,
    cornerRadius: outerCornerRadius,
  })
  const fillTrackPath =
    layout.fill > 0
      ? getArcFilledTrackPath({
          centerX: layout.centerX,
          centerY: layout.centerY,
          radius: layout.radius,
          startAngle: layout.startAngle,
          sweepAngle: layout.sweepAngle * layout.fill,
          trackThickness: layout.trackThickness,
          cornerRadius: trackCornerRadius,
        })
      : ''
  const showLabels = Boolean(data.show_min_max_labels)
  const minLabel = Number.isInteger(layout.min) ? `${layout.min}` : layout.min.toFixed(1)
  const maxLabel = Number.isInteger(layout.max) ? `${layout.max}` : layout.max.toFixed(1)
  const labels = showLabels ? labelLayout(layout, minLabel, maxLabel, labelFontFamily, labelFontSize) : null
  const valueMeasurement = measureArcPreviewText(innerModel.valueText, innerModel.fontSize, innerModel.fontFamily)
  const verticalText = /^[0-9:.%+-]+$/.test(innerModel.valueText) ? NUMERIC_PREVIEW_VERTICAL_METRICS_TEXT : innerModel.valueText
  const valueVerticalMeasurement = measureArcPreviewText(verticalText, innerModel.fontSize, innerModel.fontFamily)
  const unitMeasurement = innerModel.unitText
    ? measureArcPreviewText(innerModel.unitText, Math.max(innerModel.fontSize * 0.28, 12), innerModel.fontFamily)
    : null
  const innerLayout = getArcInnerWidgetLayout({
    centerX: layout.centerX,
    centerY: layout.centerY,
    offsetX: data.inner_widget_offset_x,
    offsetY: data.inner_widget_offset_y,
    fontSize: innerModel.fontSize,
    valueMeasure: valueMeasurement,
    valueVerticalMeasure: valueVerticalMeasurement,
    unitMeasure: unitMeasurement,
    showUnit: Boolean(innerModel.unitText),
  })
  const shadow = borderThickness > 0 ? getTextShadowParts(sceneStyle) : undefined
  const shadowFilterId = sanitizeSvgId(`arc-gauge-${widget.id || generatedId}-shadow`)
  const valueShadowFilterId = sanitizeSvgId(`arc-gauge-${widget.id || generatedId}-value-shadow`)
  const unitShadowFilterId = sanitizeSvgId(`arc-gauge-${widget.id || generatedId}-unit-shadow`)
  const labelShadowFilterId = sanitizeSvgId(`arc-gauge-${widget.id || generatedId}-label-shadow`)
  const borderMaskId = sanitizeSvgId(`arc-gauge-${widget.id || generatedId}-border-mask`)
  const shadowColor = shadow ? normalizeSvgShadowColor(shadow.color, opacity) : null
  const outerStrokeWidth = outerTrackThickness
  const borderMask = borderThickness > 0 ? `url(#${borderMaskId})` : undefined
  const maskPadding = outerStrokeWidth + 1

  return (
    <svg
      width={width * scale}
      height={height * scale}
      viewBox={`0 0 ${width} ${height}`}
      className="block overflow-visible"
      data-testid="arc-gauge-preview"
    >
      {shadow ? <PreviewSvgShadowBlurFilter id={shadowFilterId} shadow={shadow} /> : null}
      {borderThickness > 0 ? (
        <defs>
          <mask
            id={borderMaskId}
            maskUnits="userSpaceOnUse"
            x={-maskPadding}
            y={-maskPadding}
            width={width + maskPadding * 2}
            height={height + maskPadding * 2}
            style={{ maskType: 'luminance' }}
          >
            <ArcTrackPath d={outerTrackPath} fill="#ffffff" />
            <ArcTrackPath d={trackPath} fill="#000000" />
          </mask>
        </defs>
      ) : null}
      {shadow && shadowColor ? (
        <g
          transform={`translate(${shadow.distance} ${shadow.distance})`}
          filter={shadow.strength > 0 ? `url(#${shadowFilterId})` : undefined}
          mask={borderMask}
        >
          <ArcTrackPath d={outerTrackPath} fill={shadowColor.color} fillOpacity={shadowColor.opacity} />
        </g>
      ) : null}
      {borderThickness > 0 ? (
        <ArcTrackPath d={outerTrackPath} fill={data.track_border_color} fillOpacity={opacity} mask={borderMask} dataTestId="arc-gauge-border" />
      ) : null}
      <ArcTrackPath
        d={trackPath}
        fill={data.track_empty_color}
        fillOpacity={(data.track_empty_opacity ?? 1) * opacity}
        dataTestId="arc-gauge-empty-track"
      />
      {fillTrackPath ? (
        <ArcTrackPath
          d={fillTrackPath}
          fill={data.track_filled_color}
          fillOpacity={(data.track_filled_opacity ?? 1) * opacity}
          dataTestId="arc-gauge-filled-track"
        />
      ) : null}
      {showLabels ? (
        <>
          <PreviewSvgText
            text={minLabel}
            x={labels.min.x}
            baseline={labels.min.baseline}
            color={data.min_max_label_color}
            fontFamily={labelFontFamily}
            fontSize={labelFontSize}
            opacity={opacity}
            shadow={shadow}
            shadowFilterId={`${labelShadowFilterId}-min`}
            borderColor={sceneStyle?.border_color}
            borderThickness={sceneStyle?.border_thickness}
          />
          <PreviewSvgText
            text={maxLabel}
            x={labels.max.x}
            baseline={labels.max.baseline}
            color={data.min_max_label_color}
            fontFamily={labelFontFamily}
            fontSize={labelFontSize}
            opacity={opacity}
            shadow={shadow}
            shadowFilterId={`${labelShadowFilterId}-max`}
            borderColor={sceneStyle?.border_color}
            borderThickness={sceneStyle?.border_thickness}
          />
        </>
      ) : null}
      {innerLayout.unit ? (
        <PreviewSvgText
          text={innerModel.unitText}
          x={innerLayout.unit.x}
          baseline={innerLayout.unit.baseline}
          color={data.unit_color}
          fontFamily={innerModel.fontFamily}
          fontSize={innerLayout.unit.fontSize}
          opacity={opacity}
          shadow={shadow}
          shadowFilterId={unitShadowFilterId}
          borderColor={sceneStyle?.border_color}
          borderThickness={sceneStyle?.border_thickness}
        />
      ) : null}
      <PreviewSvgText
        text={innerModel.valueText}
        x={innerLayout.value.x}
        baseline={innerLayout.value.baseline}
        color={data.color}
        fontFamily={innerModel.fontFamily}
        fontSize={innerModel.fontSize}
        opacity={opacity}
        shadow={shadow}
        shadowFilterId={valueShadowFilterId}
        borderColor={sceneStyle?.border_color}
        borderThickness={sceneStyle?.border_thickness}
      />
    </svg>
  )
}
