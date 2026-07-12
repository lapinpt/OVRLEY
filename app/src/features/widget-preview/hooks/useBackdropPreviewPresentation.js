import { useMemo } from 'react'

const RECTANGLE_CORNER_KEYS = ['round_top_left', 'round_top_right', 'round_bottom_right', 'round_bottom_left']

/** Returns an inset rectangle path using normalized backdrop dimensions and corner flags. */
function roundedRectPath(data, inset, radius) {
  const width = data.width - inset * 2
  const height = data.height - inset * 2
  const clampedRadius = Math.min(radius, width * 0.5, height * 0.5)
  const tl = data.round_top_left ? clampedRadius : 0
  const tr = data.round_top_right ? clampedRadius : 0
  const br = data.round_bottom_right ? clampedRadius : 0
  const bl = data.round_bottom_left ? clampedRadius : 0
  const right = inset + width
  const bottom = inset + height

  return [
    `M ${inset + tl} ${inset}`,
    `H ${right - tr}`,
    tr > 0 ? `Q ${right} ${inset} ${right} ${inset + tr}` : `L ${right} ${inset}`,
    `V ${bottom - br}`,
    br > 0 ? `Q ${right} ${bottom} ${right - br} ${bottom}` : `L ${right} ${bottom}`,
    `H ${inset + bl}`,
    bl > 0 ? `Q ${inset} ${bottom} ${inset} ${bottom - bl}` : `L ${inset} ${bottom}`,
    `V ${inset + tl}`,
    tl > 0 ? `Q ${inset} ${inset} ${inset + tl} ${inset}` : `L ${inset} ${inset}`,
    'Z',
  ].join(' ')
}

/** Returns the normalized rectangle radius adjusted for a thick rounded border. */
function effectiveRectangleRadius(data) {
  const hasRoundedCorner = RECTANGLE_CORNER_KEYS.some((key) => data[key])
  return hasRoundedCorner && data.border_thickness > data.corner_radius ? data.border_thickness : data.corner_radius
}

/**
 * Builds all non-JSX presentation state for a normalized backdrop widget.
 * @param {object} params - Normalized backdrop and global preview inputs.
 * @returns {object} Presentation model consumed by the backdrop renderer.
 */
export function useBackdropPreviewPresentation({ widget, globalOpacity }) {
  const data = widget.data

  return useMemo(() => {
    const opacity = data.opacity * globalOpacity
    const hasBorder = data.border_thickness > 0

    if (data.display_type === 'rectangle') {
      const radius = effectiveRectangleRadius(data)
      return {
        data,
        opacity,
        hasBorder,
        fillPath: roundedRectPath(data, data.border_thickness, radius - data.border_thickness),
        strokePath: hasBorder ? roundedRectPath(data, data.border_thickness * 0.5, radius) : null,
      }
    }

    return {
      data,
      opacity,
      hasBorder,
      fillRadius: data.diameter * 0.5 - data.border_thickness,
      strokeRadius: (data.diameter - data.border_thickness) * 0.5,
    }
  }, [data, globalOpacity])
}
