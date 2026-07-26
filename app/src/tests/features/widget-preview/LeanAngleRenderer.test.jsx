import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { OverlayLeanAngleWidget } from '@/features/widget-preview/widgets/lean-angle/LeanAnglePreview'

const DEFAULT_WIDGET = {
  id: 'lean-angle-preview',
  type: 'lean_angle',
  category: 'values',
  data: {
    value: 'lean_angle',
    display_type: 'lean_angle',
    width: 180,
    height: 140,
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
  test('renders the border, empty track fill, and no dynamic fill when there is no activity', () => {
    render(<OverlayLeanAngleWidget widget={DEFAULT_WIDGET} activity={null} previewSecond={0} globalOpacity={1} globalScale={1} />)

    const border = screen.getByTestId('lean-angle-border')
    expect(border).toHaveAttribute(
      'd',
      'M 32.842323 37 A 66 66 0 0 1 147.157677 37 L 126.373067 49 A 42 42 0 0 0 53.626933 49 Z',
    )
    expect(border).toHaveAttribute('fill', '#ffffff')
    expect(border.getAttribute('mask')).toBeTruthy()
    expect(border).not.toHaveAttribute('stroke')
    expect(screen.getByTestId('lean-angle-preview').querySelector('mask')).toBeTruthy()

    const emptyFill = screen.getByTestId('lean-angle-empty-track')
    expect(emptyFill).toHaveAttribute(
      'd',
      'M 35.601444 36.283578 A 64 64 0 0 1 144.398556 36.283578 L 127.065733 46.290688 A 44 44 0 0 0 52.934267 46.290688 Z',
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
      'M 90 6 A 64 64 0 0 1 122 14.574374 L 112 31.894882 A 44 44 0 0 0 90 26 Z',
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
      'M 90 6 A 64 64 0 0 0 34.574374 38 L 51.894882 48 A 44 44 0 0 1 90 26 Z',
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
    const borderShadow = svg.querySelector('g[filter][mask]')

    expect(borderShadow).toBeTruthy()
    expect(borderShadow).toHaveAttribute('transform', 'translate(3 3)')
    expect(svg.querySelector('text[filter="url(#lean-angle-lean-angle-preview-value-shadow)"]')).toBeTruthy()
    expect(svg.querySelector('text[filter="url(#lean-angle-lean-angle-preview-unit-shadow)"]')).toBeTruthy()
  })
})
