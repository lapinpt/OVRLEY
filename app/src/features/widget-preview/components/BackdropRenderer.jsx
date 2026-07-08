/**
 * Basic SVG renderer for static backdrop widgets.
 */

import { memo } from 'react'
import { resolveActiveBackdropData } from '@/lib/widget/widget-resolver'

const RECTANGLE_CORNER_KEYS = ['round_top_left', 'round_top_right', 'round_bottom_right', 'round_bottom_left']

function roundedRectPath({ x, y, width, height, radius, corners }) {
  const clampedRadius = Math.max(0, Math.min(radius, width * 0.5, height * 0.5))
  const tl = corners.round_top_left ? clampedRadius : 0
  const tr = corners.round_top_right ? clampedRadius : 0
  const br = corners.round_bottom_right ? clampedRadius : 0
  const bl = corners.round_bottom_left ? clampedRadius : 0
  const right = x + width
  const bottom = y + height

  return [
    `M ${x + tl} ${y}`,
    `H ${right - tr}`,
    tr > 0 ? `Q ${right} ${y} ${right} ${y + tr}` : `L ${right} ${y}`,
    `V ${bottom - br}`,
    br > 0 ? `Q ${right} ${bottom} ${right - br} ${bottom}` : `L ${right} ${bottom}`,
    `H ${x + bl}`,
    bl > 0 ? `Q ${x} ${bottom} ${x} ${bottom - bl}` : `L ${x} ${bottom}`,
    `V ${y + tl}`,
    tl > 0 ? `Q ${x} ${y} ${x + tl} ${y}` : `L ${x} ${y}`,
    'Z',
  ].join(' ')
}

function effectiveRectangleRadius(data, width, height, borderThickness) {
  const hasRoundedCorner = RECTANGLE_CORNER_KEYS.some((key) => Boolean(data[key]))
  let radius = Math.max(0, Math.min(data.corner_radius ?? 0, Math.min(width, height) * 0.5))
  if (hasRoundedCorner && borderThickness > radius) {
    radius = borderThickness
  }
  return radius
}

function OverlayBackdropWidget({ widget, globalOpacity = 1, globalScale = 1 }) {
  const data = resolveActiveBackdropData(widget.data)
  const opacity = (data.opacity ?? 1) * globalOpacity
  const scale = globalScale || 1
  const borderThickness = Math.max(0, data.border_thickness ?? 0)
  const hasBorder = borderThickness > 0

  if (data.display_type === 'rectangle') {
    const width = data.width ?? 0
    const height = data.height ?? 0
    if (width <= 0 || height <= 0) return null

    const radius = effectiveRectangleRadius(data, width, height, borderThickness)
    const fillInset = borderThickness
    const fillPath = roundedRectPath({
      x: fillInset,
      y: fillInset,
      width: Math.max(0, width - fillInset * 2),
      height: Math.max(0, height - fillInset * 2),
      radius: Math.max(0, radius - borderThickness),
      corners: data,
    })
    const strokeInset = borderThickness * 0.5
    const strokePath = hasBorder
      ? roundedRectPath({
          x: strokeInset,
          y: strokeInset,
          width: Math.max(0, width - borderThickness),
          height: Math.max(0, height - borderThickness),
          radius,
          corners: data,
        })
      : null

    return (
      <svg
        width={width * scale}
        height={height * scale}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
        data-testid="backdrop-preview"
      >
        <path d={fillPath} fill={data.fill_color} fillOpacity={data.fill_opacity ?? 1} opacity={opacity} data-testid="backdrop-fill" />
        {hasBorder ? (
          <path
            d={strokePath}
            fill="none"
            opacity={opacity}
            stroke={data.border_color}
            strokeOpacity={data.border_opacity ?? 1}
            strokeWidth={borderThickness}
            data-testid="backdrop-border"
          />
        ) : null}
      </svg>
    )
  }

  if (data.display_type === 'circle') {
    const diameter = data.diameter ?? 0
    if (diameter <= 0) return null

    const fillRadius = Math.max(0, diameter * 0.5 - borderThickness)
    const strokeRadius = Math.max(0, (diameter - borderThickness) * 0.5)

    return (
      <svg
        width={diameter * scale}
        height={diameter * scale}
        viewBox={`0 0 ${diameter} ${diameter}`}
        className="block overflow-visible"
        data-testid="backdrop-preview"
      >
        <circle
          cx={diameter * 0.5}
          cy={diameter * 0.5}
          r={fillRadius}
          fill={data.fill_color}
          fillOpacity={data.fill_opacity ?? 1}
          opacity={opacity}
          data-testid="backdrop-fill"
        />
        {hasBorder ? (
          <circle
            cx={diameter * 0.5}
            cy={diameter * 0.5}
            r={strokeRadius}
            fill="none"
            opacity={opacity}
            stroke={data.border_color}
            strokeOpacity={data.border_opacity ?? 1}
            strokeWidth={borderThickness}
            data-testid="backdrop-border"
          />
        ) : null}
      </svg>
    )
  }

  return null
}

export default memo(
  OverlayBackdropWidget,
  (previousProps, nextProps) =>
    previousProps.widget === nextProps.widget &&
    previousProps.globalOpacity === nextProps.globalOpacity &&
    previousProps.globalScale === nextProps.globalScale,
)
