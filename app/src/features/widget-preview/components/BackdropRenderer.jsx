/**
 * Basic SVG renderer for static backdrop widgets.
 */

import { memo } from 'react'
import { useBackdropPreviewPresentation } from '../hooks/useBackdropPreviewPresentation'

/**
 * Renders a normalized backdrop presentation as SVG.
 * @param {object} props - Backdrop widget and global preview transforms.
 * @returns {JSX.Element|null} Rectangle or circle backdrop preview.
 */
function OverlayBackdropWidget({ widget, globalOpacity, globalScale }) {
  const { data, opacity, hasBorder, fillPath, strokePath, fillRadius, strokeRadius } = useBackdropPreviewPresentation({ widget, globalOpacity })

  if (data.display_type === 'rectangle') {
    return (
      <svg
        width={data.width * globalScale}
        height={data.height * globalScale}
        viewBox={`0 0 ${data.width} ${data.height}`}
        className="block overflow-visible"
        data-testid="backdrop-preview"
      >
        <path d={fillPath} fill={data.fill_color} fillOpacity={data.fill_opacity} opacity={opacity} data-testid="backdrop-fill" />
        {hasBorder ? (
          <path
            d={strokePath}
            fill="none"
            opacity={opacity}
            stroke={data.border_color}
            strokeOpacity={data.border_opacity}
            strokeWidth={data.border_thickness}
            data-testid="backdrop-border"
          />
        ) : null}
      </svg>
    )
  }

  if (data.display_type === 'circle') {
    return (
      <svg
        width={data.diameter * globalScale}
        height={data.diameter * globalScale}
        viewBox={`0 0 ${data.diameter} ${data.diameter}`}
        className="block overflow-visible"
        data-testid="backdrop-preview"
      >
        <circle
          cx={data.diameter * 0.5}
          cy={data.diameter * 0.5}
          r={fillRadius}
          fill={data.fill_color}
          fillOpacity={data.fill_opacity}
          opacity={opacity}
          data-testid="backdrop-fill"
        />
        {hasBorder ? (
          <circle
            cx={data.diameter * 0.5}
            cy={data.diameter * 0.5}
            r={strokeRadius}
            fill="none"
            opacity={opacity}
            stroke={data.border_color}
            strokeOpacity={data.border_opacity}
            strokeWidth={data.border_thickness}
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
