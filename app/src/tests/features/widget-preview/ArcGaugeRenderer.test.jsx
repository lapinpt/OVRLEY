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

  test('renders a rounded stroked fill and vertically stacked inner metric text', () => {
    render(<OverlayArcGaugeWidget widget={makeWidget()} activity={activity} previewSecond={0.5} globalScale={1} />)

    const svg = screen.getByTestId('arc-gauge-preview')
    const filledTrack = screen.getByTestId('arc-gauge-filled-track')
    expect(filledTrack).toHaveAttribute('stroke', '#40e0d0')
    expect(filledTrack).toHaveAttribute('stroke-linecap', 'round')
    expect(filledTrack.getAttribute('d')).toContain('A')
    expect(screen.getByText('180')).toBeInTheDocument()
    expect(screen.getByText('KM/H')).toBeInTheDocument()
    expect(svg.querySelectorAll('path').length).toBeGreaterThanOrEqual(3)
  })

  test('uses circle strokes for a full arc while keeping labels separate', () => {
    render(<OverlayArcGaugeWidget widget={makeWidget({ arc_angle: 360 })} activity={activity} previewSecond={0.5} globalScale={1} />)

    const border = screen.getByTestId('arc-gauge-border')
    expect(border.tagName).toBe('circle')
    expect(border.parentElement).toHaveAttribute('mask')
    expect(screen.getByTestId('arc-gauge-empty-track').tagName).toBe('circle')
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
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
