import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { OverlayLeanAngleWidget } from '@/features/widget-preview/widgets/lean-angle/LeanAnglePreview'
import { getLeanAngleLayout } from '@/lib/widget/lean-angle-geometry'

const DEFAULT_WIDGET = {
  id: 'lean-angle-preview',
  type: 'lean_angle',
  category: 'values',
  data: {
    value: 'lean_angle',
    display_type: 'lean_angle',
    diameter: 180,
    opacity: 1,
    track_empty_color: '#222222',
    track_empty_opacity: 0.5,
    track_filled_color: '#dce2e8',
    track_filled_opacity: 1,
    track_border_thickness: 2,
    track_border_color: '#ffffff',
    track_thickness: 24,
    font: 'Arial.ttf',
    font_size: 60,
    color: '#ffffff',
    unit_color: '#00ff00',
    show_units: true,
    value_offset_x: 0,
    value_offset_y: 0,
  },
}

const ACTIVITY = { sample_elapsed_seconds: [0], lean_angle: [30] }

describe('OverlayLeanAngleWidget', () => {
  test('derives the default logical frame from diameter, track thickness, and font size', () => {
    const layout = getLeanAngleLayout({ diameter: 300, track_thickness: 100, font_size: 60 })

    expect(layout.outerRadius).toBe(150)
    expect(layout.innerRadius).toBe(50)
    expect(layout.width).toBeCloseTo(259.80762, 5)
    expect(layout.height).toBeCloseTo(177.6, 5)
    expect(layout.centerX).toBeCloseTo(129.90381, 5)
    expect(layout.centerY).toBe(150)
  })

  test('renders the border, empty track fill, and no dynamic fill when there is no activity', () => {
    render(<OverlayLeanAngleWidget widget={DEFAULT_WIDGET} activity={null} previewSecond={0} globalOpacity={1} globalScale={1} />)

    const border = screen.getByTestId('lean-angle-border')
    expect(border).toHaveAttribute('d', 'M 0 45 A 90 90 0 0 1 155.884573 45 L 135.099963 57 A 66 66 0 0 0 20.78461 57 Z')
    expect(border).toHaveAttribute('fill', '#ffffff')
    expect(border.getAttribute('mask')).toBeTruthy()
    expect(border).not.toHaveAttribute('stroke')
    expect(screen.getByTestId('lean-angle-preview').querySelector('mask')).toBeTruthy()

    const emptyFill = screen.getByTestId('lean-angle-empty-track')
    expect(emptyFill).toHaveAttribute(
      'd',
      'M 2.751736 44.279314 A 88 88 0 0 1 153.132837 44.279314 L 135.806537 54.282658 A 68 68 0 0 0 20.078036 54.282658 Z',
    )
    expect(emptyFill).toHaveAttribute('fill', '#222222')
    expect(emptyFill).toHaveAttribute('fill-opacity', '0.5')
    expect(emptyFill).not.toHaveAttribute('stroke')
  })

  test('fills from the centre in the signed direction and clamps at 60 degrees', () => {
    const { rerender } = render(
      <OverlayLeanAngleWidget widget={DEFAULT_WIDGET} activity={ACTIVITY} previewSecond={0} globalOpacity={1} globalScale={1} />,
    )

    expect(screen.getByTestId('lean-angle-filled-track')).toHaveAttribute(
      'd',
      'M 77.942286 2 A 88 88 0 0 1 121.942286 13.789764 L 111.942286 31.110273 A 68 68 0 0 0 77.942286 22 Z',
    )
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('\u00b0')).toBeInTheDocument()

    rerender(
      <OverlayLeanAngleWidget
        widget={DEFAULT_WIDGET}
        activity={{ sample_elapsed_seconds: [0], lean_angle: [-70] }}
        previewSecond={0}
        globalOpacity={1}
        globalScale={1}
      />,
    )
    expect(screen.getByTestId('lean-angle-filled-track')).toHaveAttribute(
      'd',
      'M 77.942286 2 A 88 88 0 0 0 1.732051 46 L 19.052559 56 A 68 68 0 0 1 77.942286 22 Z',
    )
  })

  test('renders missing data as -- without a fill or unit', () => {
    render(
      <OverlayLeanAngleWidget
        widget={DEFAULT_WIDGET}
        activity={{ sample_elapsed_seconds: [0], lean_angle: [null] }}
        previewSecond={0}
        globalOpacity={1}
        globalScale={1}
      />,
    )

    expect(screen.getByText('--')).toBeInTheDocument()
    expect(screen.queryByTestId('lean-angle-filled-track')).toBeNull()
    expect(screen.queryByText('\u00b0')).toBeNull()
  })

  test('applies the scene shadow to the masked border and value text', () => {
    render(
      <OverlayLeanAngleWidget
        widget={DEFAULT_WIDGET}
        activity={ACTIVITY}
        previewSecond={0}
        globalOpacity={1}
        globalScale={1}
        sceneStyle={{ shadow_color: '#000000', shadow_strength: 4, shadow_distance: 3 }}
      />,
    )

    const svg = screen.getByTestId('lean-angle-preview')
    const borderShadow = svg.querySelector('g[filter]')

    expect(borderShadow).toBeTruthy()
    expect(borderShadow).toHaveAttribute('transform', 'translate(3 3)')
    expect(borderShadow.querySelector('g[mask]')).toBeTruthy()
    expect(Number(svg.getAttribute('width'))).toBeCloseTo(155.884573, 5)
    expect(Number(svg.getAttribute('height'))).toBeCloseTo(117.6, 5)
    expect(svg).toHaveAttribute('viewBox', '0 0 155.88457268119896 117.6')
    expect(svg.querySelector('text[filter="url(#lean-angle-lean-angle-preview-value-shadow)"]')).toBeTruthy()
    expect(svg.querySelector('text[filter="url(#lean-angle-lean-angle-preview-unit-shadow)"]')).toBeTruthy()
  })
})
