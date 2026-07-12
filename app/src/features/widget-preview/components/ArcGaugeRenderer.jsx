/** Arc-shaped gauge SVG preview. */

import { getArcFilledTrackPath } from '../utils/arcTrackPath'
import { useArcGaugePreviewPresentation } from '../hooks/useArcGaugePreviewPresentation'
import { PreviewSvgShadowBlurFilter, PreviewSvgText } from './previewSvgComponents'

/**
 * Renders a filled arc track, optionally constrained by an SVG mask.
 * @param {object} props - SVG paint props plus arc geometry fields.
 * @returns {JSX.Element} Arc path or masked arc path.
 */
function ArcTrackPath({ fill, fillOpacity, mask, dataTestId, ...geometry }) {
  const path = <path data-testid={dataTestId} d={getArcFilledTrackPath(geometry)} fill={fill} fillOpacity={fillOpacity} fillRule="evenodd" />

  return mask ? <g mask={mask}>{path}</g> : path
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
      {data.track_border_thickness > 0 || fillReveal ? (
        <defs>
          {data.track_border_thickness > 0 ? (
            <mask
              id={`${data.display_type}-gauge-${widget.id}-border-mask`}
              maskUnits="userSpaceOnUse"
              x={-maskPadding}
              y={-maskPadding}
              width={data.width + maskPadding * 2}
              height={data.height + maskPadding * 2}
              style={{ maskType: 'luminance' }}
            >
              <ArcTrackPath
                {...trackGeometry}
                trackThickness={layout.outerStrokeWidth}
                cornerRadius={outerCornerRadius}
                fill="#ffffff"
                fillOpacity={1}
              />
              <ArcTrackPath {...trackGeometry} cornerRadius={data.track_corner_radius} fill="#000000" fillOpacity={1} />
            </mask>
          ) : null}
          {fillReveal ? (
            <clipPath id={`${data.display_type}-gauge-${widget.id}-fill-clip`}>
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
          filter={`url(#${data.display_type}-gauge-${widget.id}-shadow)`}
          mask={data.track_border_thickness > 0 ? `url(#${data.display_type}-gauge-${widget.id}-border-mask)` : undefined}
        >
          <ArcTrackPath
            {...trackGeometry}
            trackThickness={layout.outerStrokeWidth}
            cornerRadius={outerCornerRadius}
            fill={shadow.color}
            fillOpacity={opacity}
          />
        </g>
      ) : null}
      {data.track_border_thickness > 0 ? (
        <ArcTrackPath
          {...trackGeometry}
          trackThickness={layout.outerStrokeWidth}
          cornerRadius={outerCornerRadius}
          fill={data.track_border_color}
          fillOpacity={opacity}
          mask={`url(#${data.display_type}-gauge-${widget.id}-border-mask)`}
          dataTestId={`${data.display_type}-gauge-border`}
        />
      ) : null}
      <ArcTrackPath
        {...trackGeometry}
        cornerRadius={data.track_corner_radius}
        fill={data.track_empty_color}
        fillOpacity={data.track_empty_opacity * opacity}
        dataTestId={`${data.display_type}-gauge-empty-track`}
      />
      {fillReveal ? (
        <g clipPath={`url(#${data.display_type}-gauge-${widget.id}-fill-clip)`}>
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
