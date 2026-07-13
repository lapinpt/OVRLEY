/** Arc-shaped gauge SVG preview. */

import { getArcFilledTrackPath, getArcRoundedSegmentPath } from './trackPath'
import { useArcGaugePreviewPresentation } from './useArcGaugePreview'
import { PreviewSvgShadowBlurFilter, PreviewSvgText } from '../../shared/PreviewSvgComponents'

/**
 * Renders a filled arc track path.
 * @param {object} props - SVG paint props plus arc geometry fields.
 * @returns {JSX.Element} Arc path or masked arc path.
 */
function ArcTrackPath({ fill, fillOpacity, dataTestId, ...geometry }) {
  return <path data-testid={dataTestId} d={getArcRoundedSegmentPath(geometry)} fill={fill} fillOpacity={fillOpacity} fillRule="evenodd" />
}

function ArcSegmentPaths({ geometries, dataTestId, ...paint }) {
  const paths = []
  for (let index = 0; index < geometries.length; index += 1) {
    paths.push(
      <path
        key={index}
        data-testid={dataTestId}
        d={getArcRoundedSegmentPath({ ...geometries[index], ...paint })}
        fill={paint.fill}
        fillOpacity={paint.fillOpacity}
        fillRule="evenodd"
        stroke={paint.stroke}
        strokeOpacity={paint.strokeOpacity}
        strokeWidth={paint.strokeWidth}
      />,
    )
  }
  return paths
}

function ArcSegmentMaskPaths({ geometries, borderThickness, cornerRadius }) {
  const paths = []
  for (let index = 0; index < geometries.length; index += 1) {
    const path = getArcRoundedSegmentPath({ ...geometries[index], cornerRadius })
    paths.push(
      <g key={index}>
        <path d={path} fill="#ffffff" fillOpacity={1} fillRule="evenodd" stroke="#ffffff" strokeWidth={borderThickness * 2} />
        <path d={path} fill="#000000" fillOpacity={1} fillRule="evenodd" />
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

function ArcGaugeTrack({ data, trackGeometry, barLayout, filledBarCount, fillReveal, opacity, shadow, maskPadding, widgetId }) {
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
              <ArcSegmentMaskPaths geometries={geometries} borderThickness={data.track_border_thickness} cornerRadius={data.track_corner_radius} />
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
            cornerRadius={data.track_corner_radius}
            fill={shadow.color}
            fillOpacity={opacity}
            stroke={shadow.color}
            strokeOpacity={opacity}
            strokeWidth={data.track_border_thickness * 2}
          />
        </g>
      ) : null}
      {data.track_border_thickness > 0 ? (
        <g mask={`url(#${maskId})`}>
          <ArcSegmentPaths
            geometries={geometries}
            cornerRadius={data.track_corner_radius}
            fill={data.track_border_color}
            fillOpacity={opacity}
            stroke={data.track_border_color}
            strokeOpacity={opacity}
            strokeWidth={data.track_border_thickness * 2}
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
            cornerRadius={data.track_corner_radius}
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
  const presentation = useArcGaugePreviewPresentation({ widget, activity, previewSecond, globalOpacity, sceneStyle })
  const {
    trackGeometry,
    innerModel,
    innerLayout,
    opacity,
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
      width={widget.data.width * globalScale}
      height={widget.data.height * globalScale}
      viewBox={`0 0 ${widget.data.width} ${widget.data.height}`}
      className="block overflow-visible"
      data-testid={`${widget.data.display_type}-gauge-preview`}
    >
      {shadow ? <PreviewSvgShadowBlurFilter id={`${widget.data.display_type}-gauge-${widget.id}-shadow`} shadow={shadow} /> : null}
      <ArcGaugeTrack
        data={widget.data}
        trackGeometry={trackGeometry}
        barLayout={barLayout}
        filledBarCount={filledBarCount}
        fillReveal={fillReveal}
        opacity={opacity}
        shadow={shadow}
        maskPadding={maskPadding}
        widgetId={widget.id}
      />
      {widget.data.show_min_max_labels ? (
        <>
          <PreviewSvgText
            text={minLabel}
            x={labels.min.x}
            baseline={labels.min.baseline}
            color={widget.data.min_max_label_color}
            fontFamily={labelFontFamily}
            fontSize={widget.data.min_max_label_font_size}
            opacity={opacity}
            shadow={shadow}
            shadowFilterId={`${widget.data.display_type}-gauge-${widget.id}-label-shadow-min`}
            borderColor={sceneStyle?.border_color}
            borderThickness={sceneStyle?.border_thickness}
          />
          <PreviewSvgText
            text={maxLabel}
            x={labels.max.x}
            baseline={labels.max.baseline}
            color={widget.data.min_max_label_color}
            fontFamily={labelFontFamily}
            fontSize={widget.data.min_max_label_font_size}
            opacity={opacity}
            shadow={shadow}
            shadowFilterId={`${widget.data.display_type}-gauge-${widget.id}-label-shadow-max`}
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
          color={widget.data.unit_color}
          fontFamily={innerModel.fontFamily}
          fontSize={innerLayout.unit.fontSize}
          opacity={opacity}
          shadow={shadow}
          shadowFilterId={`${widget.data.display_type}-gauge-${widget.id}-unit-shadow`}
          borderColor={sceneStyle?.border_color}
          borderThickness={sceneStyle?.border_thickness}
        />
      ) : null}
      <PreviewSvgText
        text={innerModel.valueText}
        x={innerLayout.value.x}
        baseline={innerLayout.value.baseline}
        color={widget.data.color}
        fontFamily={innerModel.fontFamily}
        fontSize={widget.data.font_size}
        opacity={opacity}
        shadow={shadow}
        shadowFilterId={`${widget.data.display_type}-gauge-${widget.id}-value-shadow`}
        borderColor={sceneStyle?.border_color}
        borderThickness={sceneStyle?.border_thickness}
      />
    </svg>
  )
}
