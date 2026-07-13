/**
 * Basic SVG renderer for static backdrop widgets.
 */

import { memo } from 'react'
import { getBackdropPreviewPresentation } from './model'

/**
 * Renders a normalized backdrop presentation as SVG.
 * @param {object} props - Backdrop widget and global preview transforms.
 * @returns {JSX.Element|null} Rectangle or circle backdrop preview.
 */
function OverlayBackdropWidget({ widget, globalOpacity, globalScale }) {
  const presentation = getBackdropPreviewPresentation({ widget, globalOpacity })

  if (widget.data.display_type === 'rectangle') {
    return (
      <svg
        width={widget.data.width * globalScale}
        height={widget.data.height * globalScale}
        viewBox={`0 0 ${widget.data.width} ${widget.data.height}`}
        className="block overflow-visible"
        data-testid="backdrop-preview"
      >
        <path
          d={presentation.fillPath}
          fill={widget.data.fill_color}
          fillOpacity={widget.data.fill_opacity}
          opacity={presentation.opacity}
          data-testid="backdrop-fill"
        />
        {presentation.hasBorder ? (
          <path
            d={presentation.strokePath}
            fill="none"
            opacity={presentation.opacity}
            stroke={widget.data.border_color}
            strokeOpacity={widget.data.border_opacity}
            strokeWidth={widget.data.border_thickness}
            data-testid="backdrop-border"
          />
        ) : null}
      </svg>
    )
  }

  return (
    <svg
      width={widget.data.diameter * globalScale}
      height={widget.data.diameter * globalScale}
      viewBox={`0 0 ${widget.data.diameter} ${widget.data.diameter}`}
      className="block overflow-visible"
      data-testid="backdrop-preview"
    >
      <circle
        cx={widget.data.diameter * 0.5}
        cy={widget.data.diameter * 0.5}
        r={presentation.fillRadius}
        fill={widget.data.fill_color}
        fillOpacity={widget.data.fill_opacity}
        opacity={presentation.opacity}
        data-testid="backdrop-fill"
      />
      {presentation.hasBorder ? (
        <circle
          cx={widget.data.diameter * 0.5}
          cy={widget.data.diameter * 0.5}
          r={presentation.strokeRadius}
          fill="none"
          opacity={presentation.opacity}
          stroke={widget.data.border_color}
          strokeOpacity={widget.data.border_opacity}
          strokeWidth={widget.data.border_thickness}
          data-testid="backdrop-border"
        />
      ) : null}
    </svg>
  )
}

export default memo(
  OverlayBackdropWidget,
  (previousProps, nextProps) =>
    previousProps.widget === nextProps.widget &&
    previousProps.globalOpacity === nextProps.globalOpacity &&
    previousProps.globalScale === nextProps.globalScale,
)
