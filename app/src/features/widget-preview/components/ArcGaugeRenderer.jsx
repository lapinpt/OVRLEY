/**
 * Arc gauge SVG preview.
 *
 * Mirrors the Skia arc-gauge renderer: the empty stroked track, border,
 * min/max labels, and unit form the static presentation; the filled arc and
 * value text change with the current preview frame. Arc gauges intentionally
 * render no metric icon.
 */

import { useId } from 'react'
import { getArcGaugeLayout, getArcInnerWidgetLayout, getArcLabelGap, getArcPoint, getArcSvgPath } from '../utils/arcGaugeGeometry'
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

function labelLayout(layout, minLabel, maxLabel, fontFamily, fontSize) {
  const minMeasurement = measurePreviewText(minLabel, fontSize, fontFamily)
  const maxMeasurement = measurePreviewText(maxLabel, fontSize, fontFamily)
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

function ArcStroke({ layout, sweepAngle, stroke, strokeWidth, strokeOpacity = 1, strokeLinecap, mask, dataTestId }) {
  if (sweepAngle <= 0 || layout.radius <= 0 || strokeWidth <= 0) return null

  const isFullCircle = layout.fullCircle && sweepAngle >= 360
  const arcStroke = isFullCircle ? (
    <circle
      data-testid={dataTestId}
      cx={layout.centerX}
      cy={layout.centerY}
      r={layout.radius}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      strokeLinecap={strokeLinecap}
    />
  ) : (
    <path
      data-testid={dataTestId}
      d={getArcSvgPath({
        centerX: layout.centerX,
        centerY: layout.centerY,
        radius: layout.radius,
        startAngle: layout.startAngle,
        sweepAngle,
      })}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity={strokeOpacity}
      strokeLinecap={strokeLinecap}
    />
  )

  return mask ? <g mask={mask}>{arcStroke}</g> : arcStroke
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
  const strokeLinecap = (data.track_corner_radius ?? 0) > 0 ? 'round' : 'butt'
  const showLabels = Boolean(data.show_min_max_labels)
  const minLabel = Number.isInteger(layout.min) ? `${layout.min}` : layout.min.toFixed(1)
  const maxLabel = Number.isInteger(layout.max) ? `${layout.max}` : layout.max.toFixed(1)
  const labels = showLabels ? labelLayout(layout, minLabel, maxLabel, labelFontFamily, labelFontSize) : null
  const valueMeasurement = measurePreviewText(innerModel.valueText, innerModel.fontSize, innerModel.fontFamily)
  const verticalText = /^[0-9:.%+-]+$/.test(innerModel.valueText) ? NUMERIC_PREVIEW_VERTICAL_METRICS_TEXT : innerModel.valueText
  const valueVerticalMeasurement = measurePreviewText(verticalText, innerModel.fontSize, innerModel.fontFamily)
  const unitMeasurement = innerModel.unitText
    ? measurePreviewText(innerModel.unitText, Math.max(innerModel.fontSize * 0.28, 12), innerModel.fontFamily)
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
  const outerStrokeWidth = layout.outerStrokeWidth
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
            <ArcStroke
              layout={layout}
              sweepAngle={layout.sweepAngle}
              stroke="#ffffff"
              strokeWidth={outerStrokeWidth}
              strokeLinecap={strokeLinecap}
            />
            <ArcStroke
              layout={layout}
              sweepAngle={layout.sweepAngle}
              stroke="#000000"
              strokeWidth={layout.trackThickness}
              strokeLinecap={strokeLinecap}
            />
          </mask>
        </defs>
      ) : null}
      {shadow && shadowColor ? (
        <g
          transform={`translate(${shadow.distance} ${shadow.distance})`}
          filter={shadow.strength > 0 ? `url(#${shadowFilterId})` : undefined}
          mask={borderMask}
        >
          <ArcStroke
            layout={layout}
            sweepAngle={layout.sweepAngle}
            stroke={shadowColor.color}
            strokeWidth={outerStrokeWidth}
            strokeOpacity={shadowColor.opacity}
            strokeLinecap={strokeLinecap}
          />
        </g>
      ) : null}
      {borderThickness > 0 ? (
        <ArcStroke
          layout={layout}
          sweepAngle={layout.sweepAngle}
          stroke={data.track_border_color}
          strokeWidth={layout.outerStrokeWidth}
          strokeOpacity={opacity}
          strokeLinecap={strokeLinecap}
          mask={borderMask}
          dataTestId="arc-gauge-border"
        />
      ) : null}
      <ArcStroke
        layout={layout}
        sweepAngle={layout.sweepAngle}
        stroke={data.track_empty_color}
        strokeWidth={layout.trackThickness}
        strokeOpacity={(data.track_empty_opacity ?? 1) * opacity}
        strokeLinecap={strokeLinecap}
        dataTestId="arc-gauge-empty-track"
      />
      {layout.fill > 0 ? (
        <ArcStroke
          layout={layout}
          sweepAngle={layout.sweepAngle * layout.fill}
          stroke={data.track_filled_color}
          strokeWidth={layout.trackThickness}
          strokeOpacity={(data.track_filled_opacity ?? 1) * opacity}
          strokeLinecap={strokeLinecap}
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
