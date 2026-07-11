import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { OverlayArcGaugeWidget } from '@/features/widget-preview/components/ArcGaugeRenderer'

function makeWidget(overrides = {}) {
  return {
    id: 'arc-gauge-1',
    type: 'speed',
    category: 'values',
    data: {
      value: 'speed',
      display_type: 'arc',
      width: 160,
      height: 160,
      arc_angle: 180,
      inner_widget_offset_x: 0,
      inner_widget_offset_y: 0,
      track_thickness: 12,
      track_corner_radius: 6,
      track_border_thickness: 2,
      track_border_color: '#ffffff',
      track_empty_color: '#222222',
      track_empty_opacity: 0.5,
      track_filled_color: '#40e0d0',
      track_filled_opacity: 1,
      track_fill_flat: false,
      show_min_max_labels: true,
      min_max_label_font: 'Arial.ttf',
      min_max_label_font_size: 12,
      min_max_label_color: '#ffffff',
      font: 'Arial.ttf',
      font_size: 40,
      color: '#ffffff',
      opacity: 1,
      show_units: true,
      unit_color: '#ffffff',
      display_unit: 'kmh',
      prefix: '',
      suffix: '',
      decimals: 0,
      ...overrides,
    },
  }
}

const activity = {
  sample_elapsed_seconds: [0, 1],
  speed: [0, 100],
}

describe('OverlayArcGaugeWidget', () => {
  test('uses global scale while retaining local SVG arc geometry', () => {
    render(<OverlayArcGaugeWidget widget={makeWidget()} activity={activity} previewSecond={0.5} globalScale={2} />)

    const svg = screen.getByTestId('arc-gauge-preview')
    expect(svg).toHaveAttribute('width', '320')
    expect(svg).toHaveAttribute('height', '320')
    expect(svg).toHaveAttribute('viewBox', '0 0 160 160')
  })

  test('renders a filled track path with vertically stacked inner metric text', () => {
    render(<OverlayArcGaugeWidget widget={makeWidget()} activity={activity} previewSecond={0.5} globalScale={1} />)

    const filledTrack = screen.getByTestId('arc-gauge-filled-track')
    expect(filledTrack).toHaveAttribute('fill', '#40e0d0')
    expect(filledTrack).toHaveAttribute('fill-rule', 'evenodd')
    expect(filledTrack.getAttribute('d')).toContain('C')
    expect(screen.getByText('180')).toBeInTheDocument()
    expect(screen.getByText('KM/H')).toBeInTheDocument()
  })

  test('uses filled ring paths for a full arc while keeping labels separate', () => {
    render(<OverlayArcGaugeWidget widget={makeWidget({ arc_angle: 360 })} activity={activity} previewSecond={0.5} globalScale={1} />)

    const border = screen.getByTestId('arc-gauge-border')
    expect(border.tagName).toBe('path')
    expect(border.parentElement).toHaveAttribute('mask')
    expect(screen.getByTestId('arc-gauge-empty-track').tagName).toBe('path')
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  test('changes the filled outline continuously as the configured corner radius changes', () => {
    const { rerender } = render(
      <OverlayArcGaugeWidget widget={makeWidget({ track_corner_radius: 0 })} activity={activity} previewSecond={0.5} globalScale={1} />,
    )
    const flatPath = screen.getByTestId('arc-gauge-empty-track').getAttribute('d')

    rerender(<OverlayArcGaugeWidget widget={makeWidget({ track_corner_radius: 3 })} activity={activity} previewSecond={0.5} globalScale={1} />)
    const partialPath = screen.getByTestId('arc-gauge-empty-track').getAttribute('d')

    rerender(<OverlayArcGaugeWidget widget={makeWidget({ track_corner_radius: 6 })} activity={activity} previewSecond={0.5} globalScale={1} />)
    const fullPath = screen.getByTestId('arc-gauge-empty-track').getAttribute('d')

    expect(partialPath).not.toBe(flatPath)
    expect(fullPath).not.toBe(partialPath)
  })

  test('uses the reveal clip to flatten the advancing fill end while retaining its configured source caps', () => {
    const { rerender } = render(<OverlayArcGaugeWidget widget={makeWidget()} activity={activity} previewSecond={0.5} globalScale={1} />)
    const roundedFillPath = screen.getByTestId('arc-gauge-filled-track').getAttribute('d')
    const roundedFillClipPath = screen.getByTestId('arc-gauge-fill-clip').getAttribute('d')
    const roundedTrackPath = screen.getByTestId('arc-gauge-empty-track').getAttribute('d')

    rerender(<OverlayArcGaugeWidget widget={makeWidget({ track_fill_flat: true })} activity={activity} previewSecond={0.5} globalScale={1} />)
    const flatFillPath = screen.getByTestId('arc-gauge-filled-track').getAttribute('d')
    const flatFillClipPath = screen.getByTestId('arc-gauge-fill-clip').getAttribute('d')
    const flatTrackPath = screen.getByTestId('arc-gauge-empty-track').getAttribute('d')

    rerender(<OverlayArcGaugeWidget widget={makeWidget({ track_corner_radius: 0 })} activity={activity} previewSecond={0.5} globalScale={1} />)
    const fullyFlatFillClipPath = screen.getByTestId('arc-gauge-fill-clip').getAttribute('d')

    expect(flatFillPath).not.toBe(roundedFillPath)
    expect(flatTrackPath).toBe(roundedTrackPath)
    expect(flatFillClipPath).not.toBe(roundedFillClipPath)
    expect(flatFillClipPath).not.toBe(fullyFlatFillClipPath)
  })

  test('grows a low fill through its reveal clip instead of redrawing a fixed cap', () => {
    const { rerender } = render(<OverlayArcGaugeWidget widget={makeWidget()} activity={activity} previewSecond={0.001} globalScale={1} />)
    const lowFillSourcePath = screen.getByTestId('arc-gauge-filled-track').getAttribute('d')
    const lowFillClipPath = screen.getByTestId('arc-gauge-fill-clip').getAttribute('d')

    rerender(<OverlayArcGaugeWidget widget={makeWidget()} activity={activity} previewSecond={0.02} globalScale={1} />)
    const higherFillSourcePath = screen.getByTestId('arc-gauge-filled-track').getAttribute('d')
    const higherFillClipPath = screen.getByTestId('arc-gauge-fill-clip').getAttribute('d')

    expect(higherFillSourcePath).toBe(lowFillSourcePath)
    expect(higherFillClipPath).not.toBe(lowFillClipPath)
  })

  test('renders no icon even when an inherited text-widget icon flag is present', () => {
    render(<OverlayArcGaugeWidget widget={makeWidget({ show_icon: true, icon_size: 45 })} activity={activity} previewSecond={0.5} globalScale={1} />)

    const svg = screen.getByTestId('arc-gauge-preview')
    expect(svg.querySelector('g[color]')).toBeNull()
  })

  test('does not render a track shadow without a border', () => {
    render(
      <OverlayArcGaugeWidget
        widget={makeWidget({ track_border_thickness: 0 })}
        activity={activity}
        previewSecond={0.5}
        globalScale={1}
        sceneStyle={{ shadow_color: '#000000', shadow_strength: 4, shadow_distance: 3 }}
      />,
    )

    const svg = screen.getByTestId('arc-gauge-preview')
    expect(svg.querySelector('g[filter]')).toBeNull()
    expect(svg.querySelector('filter')).toBeNull()
  })
})
