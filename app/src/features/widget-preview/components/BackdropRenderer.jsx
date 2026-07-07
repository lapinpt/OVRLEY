/**
 * Basic SVG renderer for static backdrop widgets.
 */

import { memo } from 'react'
import { resolveActiveBackdropData } from '@/lib/widget/widget-resolver'

function OverlayBackdropWidget({ widget, globalOpacity = 1, globalScale = 1 }) {
  const data = resolveActiveBackdropData(widget.data)
  const opacity = (data.opacity ?? 1) * globalOpacity
  const scale = globalScale || 1
  const borderThickness = data.border_thickness ?? 0
  const borderProps =
    borderThickness > 0
      ? {
          stroke: data.border_color,
          strokeOpacity: data.border_opacity ?? 1,
          strokeWidth: borderThickness,
        }
      : {}

  if (data.display_type === 'rectangle') {
    const width = data.width ?? 0
    const height = data.height ?? 0
    if (width <= 0 || height <= 0) return null

    const strokeInset = borderThickness > 0 ? borderThickness * 0.5 : 0

    return (
      <svg
        width={width * scale}
        height={height * scale}
        viewBox={`0 0 ${width} ${height}`}
        className="block overflow-visible"
        data-testid="backdrop-preview"
      >
        <rect width={width} height={height} fill={data.fill_color} fillOpacity={data.fill_opacity ?? 1} opacity={opacity} />
        {borderThickness > 0 ? (
          <rect
            x={strokeInset}
            y={strokeInset}
            width={Math.max(0, width - borderThickness)}
            height={Math.max(0, height - borderThickness)}
            fill="none"
            opacity={opacity}
            {...borderProps}
          />
        ) : null}
      </svg>
    )
  }

  if (data.display_type === 'circle') {
    const diameter = data.diameter ?? 0
    if (diameter <= 0) return null

    const radius = Math.max(0, diameter * 0.5 - borderThickness * 0.5)

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
          r={diameter * 0.5}
          fill={data.fill_color}
          fillOpacity={data.fill_opacity ?? 1}
          opacity={opacity}
        />
        {borderThickness > 0 ? <circle cx={diameter * 0.5} cy={diameter * 0.5} r={radius} fill="none" opacity={opacity} {...borderProps} /> : null}
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
