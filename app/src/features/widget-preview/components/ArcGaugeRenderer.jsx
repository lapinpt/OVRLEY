/** Arc-shaped gauge SVG preview. */

import { getArcFilledTrackPath } from '../utils/arcTrackPath'
import { useArcGaugePreviewPresentation } from '../hooks/useArcGaugePreviewPresentation'
import { PreviewSvgShadowBlurFilter, PreviewSvgText } from './previewSvgComponents'

/**
 * Renders a filled arc track path.
 * @param {object} props - SVG paint props plus arc geometry fields.
 * @returns {JSX.Element} Arc path or masked arc path.
 */
function ArcTrackPath({ fill, fillOpacity, dataTestId, ...geometry }) {
  return <path data-testid={dataTestId} d={getArcFilledTrackPath(geometry)} fill={fill} fillOpacity={fillOpacity} fillRule="evenodd" />
}

function ArcSegmentPaths({ geometries, dataTestId, ...paint }) {
  const paths = []
  for (let index = 0; index < geometries.length; index += 1) {
    paths.push(<ArcTrackPath key={index} {...geometries[index]} {...paint} dataTestId={dataTestId} />)
  }
  return paths
}

function ArcSegmentMaskPaths({ geometries, outerStrokeWidth, outerCornerRadius, innerCornerRadius }) {
  const paths = []
  for (let index = 0; index < geometries.length; index += 1) {
    paths.push(
      <g key={index}>
        <ArcTrackPath {...geometries[index]} trackThickness={outerStrokeWidth} cornerRadius={outerCornerRadius} fill="#ffffff" fillOpacity={1} />
        <ArcTrackPath {...geometries[index]} cornerRadius={innerCornerRadius} fill="#000000" fillOpacity={1} />
      </g>,
    )
  }
  return paths
}

function buildArcSegmentGeometry(trackGeometry, segments) {
  const geometries = []
  for (const segment of segments) geometries.push({ ...trackGeometry, ...segment })
  return geometries
}

function ArcGaugeTrack({
  data,
  trackGeometry,
  layout,
  barLayout,
  filledBarCount,
  fillReveal,
  fillEndCornerRadius,
  opacity,
  shadow,
  outerCornerRadius,
  maskPadding,
  widgetId,
}) {
  const segmented = barLayout != null
  const geometries = segmented ? buildArcSegmentGeometry(trackGeometry, barLayout.segments) : [trackGeometry]
  const maskId = `${data.display_type}-gauge-${widgetId}-border-mask`
  const fillClipId = `${data.display_type}-gauge-${widgetId}-fill-clip`

  return (
    <>
      {data.track_border_thickness > 0 || fillReveal ? (
        <defs>
          {data.track_border_thickness > 0 ? (
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={-maskPadding}
              y={-maskPadding}
              width={data.width + maskPadding * 2}
              height={data.height + maskPadding * 2}
              style={{ maskType: 'luminance' }}
            >
              <ArcSegmentMaskPaths
                geometries={geometries}
                outerStrokeWidth={layout.outerStrokeWidth}
                outerCornerRadius={outerCornerRadius}
                innerCornerRadius={data.track_corner_radius}
              />
            </mask>
          ) : null}
          {fillReveal ? (
            <clipPath id={fillClipId}>
              <path
                data-testid={`${data.display_type}-gauge-fill-clip`}
                d={getArcFilledTrackPath({ ...trackGeometry, ...fillReveal })}
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </clipPath>
          ) : null}
        </defs>
      ) : null}
      {shadow ? (
        <g
          transform={`translate(${shadow.distance} ${shadow.distance})`}
          filter={`url(#${data.display_type}-gauge-${widgetId}-shadow)`}
          mask={data.track_border_thickness > 0 ? `url(#${maskId})` : undefined}
        >
          <ArcSegmentPaths
            geometries={geometries}
            trackThickness={layout.outerStrokeWidth}
            cornerRadius={outerCornerRadius}
            fill={shadow.color}
            fillOpacity={opacity}
          />
        </g>
      ) : null}
      {data.track_border_thickness > 0 ? (
        <g mask={`url(#${maskId})`}>
          <ArcSegmentPaths
            geometries={geometries}
            trackThickness={layout.outerStrokeWidth}
            cornerRadius={outerCornerRadius}
            fill={data.track_border_color}
            fillOpacity={opacity}
            dataTestId={`${data.display_type}-gauge-${segmented ? 'bar-border' : 'border'}`}
          />
        </g>
      ) : null}
      <ArcSegmentPaths
        geometries={geometries}
        cornerRadius={data.track_corner_radius}
        fill={data.track_empty_color}
        fillOpacity={data.track_empty_opacity * opacity}
        dataTestId={`${data.display_type}-gauge-${segmented ? 'bar-empty' : 'empty-track'}`}
      />
      {segmented ? (
        <ArcSegmentPaths
          geometries={geometries.slice(0, filledBarCount)}
          cornerRadius={data.track_corner_radius}
          fill={data.track_filled_color}
          fillOpacity={data.track_filled_opacity * opacity}
          dataTestId={`${data.display_type}-gauge-bar-filled`}
        />
      ) : fillReveal ? (
        <g clipPath={`url(#${fillClipId})`}>
          <ArcTrackPath
            {...trackGeometry}
            startCornerRadius={data.track_corner_radius}
            endCornerRadius={fillEndCornerRadius}
            fill={data.track_filled_color}
            fillOpacity={data.track_filled_opacity * opacity}
            dataTestId={`${data.display_type}-gauge-filled-track`}
          />
        </g>
      ) : null}
    </>
  )
}

/**
 * Renders the normalized arc or corner gauge preview.
 * @param {object} props - Normalized widget and preview state.
 * @returns {JSX.Element} Gauge SVG.
 */
export function OverlayArcGaugeWidget({ widget, activity, previewSecond, globalOpacity, globalScale, sceneStyle }) {
  const data = widget.data
  const presentation = useArcGaugePreviewPresentation({ widget, activity, previewSecond, globalOpacity, sceneStyle })
  const {
    layout,
    trackGeometry,
    innerModel,
    innerLayout,
    opacity,
    fillEndCornerRadius,
    outerCornerRadius,
    fillReveal,
    barLayout,
    filledBarCount,
    minLabel,
    maxLabel,
    labels,
    labelFontFamily,
    shadow,
    maskPadding,
  } = presentation

  return (
    <svg
      width={data.width * globalScale}
      height={data.height * globalScale}
      viewBox={`0 0 ${data.width} ${data.height}`}
      className="block overflow-visible"
      data-testid={`${data.display_type}-gauge-preview`}
    >
      {shadow ? <PreviewSvgShadowBlurFilter id={`${data.display_type}-gauge-${widget.id}-shadow`} shadow={shadow} /> : null}
      <ArcGaugeTrack
        data={data}
        trackGeometry={trackGeometry}
        layout={layout}
        barLayout={barLayout}
        filledBarCount={filledBarCount}
        fillReveal={fillReveal}
        fillEndCornerRadius={fillEndCornerRadius}
        opacity={opacity}
        shadow={shadow}
        outerCornerRadius={outerCornerRadius}
        maskPadding={maskPadding}
        widgetId={widget.id}
      />
      {data.show_min_max_labels ? (
        <>
          <PreviewSvgText
            text={minLabel}
            x={labels.min.x}
            baseline={labels.min.baseline}
            color={data.min_max_label_color}
            fontFamily={labelFontFamily}
            fontSize={data.min_max_label_font_size}
            opacity={opacity}
            shadow={shadow}
            shadowFilterId={`${data.display_type}-gauge-${widget.id}-label-shadow-min`}
            borderColor={sceneStyle?.border_color}
            borderThickness={sceneStyle?.border_thickness}
          />
          <PreviewSvgText
            text={maxLabel}
            x={labels.max.x}
            baseline={labels.max.baseline}
            color={data.min_max_label_color}
            fontFamily={labelFontFamily}
            fontSize={data.min_max_label_font_size}
            opacity={opacity}
            shadow={shadow}
            shadowFilterId={`${data.display_type}-gauge-${widget.id}-label-shadow-max`}
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
          shadowFilterId={`${data.display_type}-gauge-${widget.id}-unit-shadow`}
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
        shadowFilterId={`${data.display_type}-gauge-${widget.id}-value-shadow`}
        borderColor={sceneStyle?.border_color}
        borderThickness={sceneStyle?.border_thickness}
      />
    </svg>
  )
}
