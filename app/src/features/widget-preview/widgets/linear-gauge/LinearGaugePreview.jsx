/**
 * Linear gauge SVG renderer — draws the filled track, border, and optional
 * min/max labels using pre-resolved widget data.
 *
 * Stateless: receives a resolved widget data snapshot and renders purely
 * from props. Does not own any activity or variant-resolution logic.
 *
 * @module LinearGaugeRenderer
 */

import { PreviewSvgShadowBlurFilter, PreviewSvgText } from '../../shared/PreviewSvgComponents'
import { useLinearGaugePreviewPresentation } from './useLinearGaugePreview'

function SegmentRects({ segments, layer, ...props }) {
  const rects = []
  for (let index = 0; index < segments.length; index += 1) {
    rects.push(<rect key={index} {...segments[index][layer]} {...props} />)
  }
  return rects
}

function SegmentMaskRects({ segments }) {
  const rects = []
  for (let index = 0; index < segments.length; index += 1) {
    rects.push(
      <g key={index}>
        <rect {...segments[index].outer} fill="white" />
        <rect {...segments[index].inner} fill="black" />
      </g>,
    )
  }
  return rects
}

function LinearGaugeTrack({ data, presentation, continuousFill }) {
  return (
    <>
      {data.track_border_thickness > 0 ? (
        <defs>
          <mask id={presentation.maskId}>
            <SegmentMaskRects segments={presentation.segments} />
          </mask>
        </defs>
      ) : null}
      {presentation.shadowColor ? (
        <g
          transform={`translate(${presentation.trackShadow.distance} ${presentation.trackShadow.distance})`}
          filter={`url(#${presentation.shadowFilterId})`}
          mask={data.track_border_thickness > 0 ? `url(#${presentation.maskId})` : undefined}
        >
          <SegmentRects
            segments={presentation.segments}
            layer="outer"
            fill={presentation.shadowColor.color}
            opacity={presentation.shadowColor.opacity}
          />
        </g>
      ) : null}
      {data.track_border_thickness > 0 ? (
        <SegmentRects
          segments={presentation.segments}
          layer="outer"
          fill={data.track_border_color}
          mask={`url(#${presentation.maskId})`}
          opacity={presentation.opacity}
        />
      ) : null}
      <SegmentRects
        segments={presentation.segments}
        layer={data.track_border_thickness > 0 ? 'inner' : 'outer'}
        fill={data.track_empty_color}
        fillOpacity={data.track_empty_opacity}
        opacity={presentation.opacity}
        data-testid={presentation.segmented ? 'linear-gauge-bar-empty' : 'linear-gauge-empty-track'}
      />
      {presentation.segmented ? (
        <SegmentRects
          segments={presentation.segments.slice(0, presentation.filledCount)}
          layer="inner"
          fill={data.track_filled_color}
          fillOpacity={data.track_filled_opacity}
          opacity={presentation.opacity}
          data-testid="linear-gauge-bar-filled"
        />
      ) : (
        continuousFill
      )}
    </>
  )
}

export function OverlayLinearGaugeWidget({ widget, activity, previewSecond, globalOpacity, globalScale, sceneStyle }) {
  const presentation = useLinearGaugePreviewPresentation({ widget, activity, previewSecond, globalOpacity, sceneStyle })
  const filledTrack =
    presentation.fillCornerRadius > 0 && widget.data.track_fill_flat ? (
      <rect
        x={presentation.layout.innerTrackRect.x}
        y={presentation.layout.innerTrackRect.y}
        width={presentation.layout.innerTrackRect.width}
        height={presentation.layout.innerTrackRect.height}
        rx={presentation.innerTrackCornerRadii.rx}
        ry={presentation.innerTrackCornerRadii.ry}
        clipPath={`url(#${presentation.flatFillClipId})`}
        fill={widget.data.track_filled_color}
        fillOpacity={widget.data.track_filled_opacity}
        opacity={presentation.opacity}
      />
    ) : presentation.translatedFillPath ? (
      <path
        d={presentation.translatedFillPath}
        clipPath={`url(#${presentation.innerTrackClipId})`}
        fill={widget.data.track_filled_color}
        fillOpacity={widget.data.track_filled_opacity}
        opacity={presentation.opacity}
      />
    ) : presentation.fillCornerRadius > 0 ? (
      <rect
        x={presentation.layout.fillRect.x}
        y={presentation.layout.fillRect.y}
        width={presentation.layout.fillRect.width}
        height={presentation.layout.fillRect.height}
        rx={presentation.fillCornerRadius}
        ry={presentation.fillCornerRadius}
        clipPath={`url(#${presentation.innerTrackClipId})`}
        fill={widget.data.track_filled_color}
        fillOpacity={widget.data.track_filled_opacity}
        opacity={presentation.opacity}
      />
    ) : (
      <rect
        x={presentation.layout.fillRect.x}
        y={presentation.layout.fillRect.y}
        width={presentation.layout.fillRect.width}
        height={presentation.layout.fillRect.height}
        fill={widget.data.track_filled_color}
        fillOpacity={widget.data.track_filled_opacity}
        opacity={presentation.opacity}
      />
    )

  return (
    <svg
      width={widget.data.width * globalScale}
      height={widget.data.height * globalScale}
      viewBox={`0 0 ${widget.data.width} ${widget.data.height}`}
      className="block overflow-visible"
      data-testid="linear-gauge-preview"
    >
      {presentation.trackShadow ? <PreviewSvgShadowBlurFilter id={presentation.shadowFilterId} shadow={presentation.trackShadow} /> : null}
      {!presentation.segmented && presentation.fillCornerRadius > 0 ? (
        <defs>
          <clipPath id={presentation.flatFillClipId}>
            <rect
              x={presentation.layout.fillRect.x}
              y={presentation.layout.fillRect.y}
              width={presentation.layout.fillRect.width}
              height={presentation.layout.fillRect.height}
            />
          </clipPath>
          <clipPath id={presentation.innerTrackClipId}>
            <rect
              x={presentation.layout.innerTrackRect.x}
              y={presentation.layout.innerTrackRect.y}
              width={presentation.layout.innerTrackRect.width}
              height={presentation.layout.innerTrackRect.height}
              rx={presentation.innerTrackCornerRadii.rx}
              ry={presentation.innerTrackCornerRadii.ry}
            />
          </clipPath>
        </defs>
      ) : null}
      <LinearGaugeTrack data={widget.data} presentation={presentation} continuousFill={filledTrack} />
      {widget.data.show_min_max_labels ? (
        <>
          <PreviewSvgText
            text={presentation.minLabel}
            x={presentation.labelLayout.min.x}
            baseline={presentation.labelLayout.min.y}
            color={widget.data.min_max_label_color}
            fontFamily={presentation.labelFontFamily}
            fontSize={widget.data.min_max_label_font_size}
            opacity={1}
          />
          <PreviewSvgText
            text={presentation.maxLabel}
            x={presentation.labelLayout.max.x}
            baseline={presentation.labelLayout.max.y}
            color={widget.data.min_max_label_color}
            fontFamily={presentation.labelFontFamily}
            fontSize={widget.data.min_max_label_font_size}
            opacity={1}
          />
        </>
      ) : null}
    </svg>
  )
}
