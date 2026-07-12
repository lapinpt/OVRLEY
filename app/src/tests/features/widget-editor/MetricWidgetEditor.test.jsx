import { describe, test, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MetricWidgetEditor from '@/features/widget-editor/components/metricWidget/MetricWidgetEditor'

vi.mock('@/features/scene-settings/hooks/useAvailableFonts', () => ({
  default: () => ({ recommendedFonts: [], systemFonts: [] }),
}))

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

function makeWidget(type, data = {}) {
  return {
    id: 'value-0',
    type,
    data,
  }
}

describe('MetricWidgetEditor decimal control', () => {
  test('shows decimal toggle for g_force', () => {
    render(<MetricWidgetEditor widget={makeWidget('g_force', { display_unit: 'g' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.getByText('Decimals')).toBeInTheDocument()
  })

  test('shows decimal selector for distance', () => {
    render(
      <MetricWidgetEditor
        widget={makeWidget('distance', { display_unit: 'km', decimals: 1 })}
        updateWidgetData={vi.fn()}
        setNumericField={vi.fn()}
      />,
    )
    expect(screen.getByText('Decimals')).toBeInTheDocument()
    expect(screen.getByText('Show Full Distance')).toBeInTheDocument()
  })

  test('shows decimal toggle for stride_length', () => {
    render(<MetricWidgetEditor widget={makeWidget('stride_length', { display_unit: 'm' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.getByText('Decimals')).toBeInTheDocument()
  })

  test('shows decimal toggle for torque', () => {
    render(<MetricWidgetEditor widget={makeWidget('torque', { display_unit: 'nm' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.getByText('Decimals')).toBeInTheDocument()
  })

  test('shows decimal toggle for vertical_speed', () => {
    render(<MetricWidgetEditor widget={makeWidget('vertical_speed', { display_unit: 'mps' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.getByText('Decimals')).toBeInTheDocument()
  })

  test('hides decimal toggle for pace', () => {
    render(<MetricWidgetEditor widget={makeWidget('pace', { display_unit: 'min_per_km' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.queryByText('Decimals')).not.toBeInTheDocument()
  })

  test('hides decimal toggle for air_pressure', () => {
    render(<MetricWidgetEditor widget={makeWidget('air_pressure', { display_unit: 'hpa' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.queryByText('Decimals')).not.toBeInTheDocument()
  })

  test('hides decimal toggle for ground_contact_time', () => {
    render(
      <MetricWidgetEditor widget={makeWidget('ground_contact_time', { display_unit: 'ms' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />,
    )
    expect(screen.queryByText('Decimals')).not.toBeInTheDocument()
  })

  test('hides decimal toggle for stroke_rate', () => {
    render(<MetricWidgetEditor widget={makeWidget('stroke_rate', { display_unit: 'spm' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.queryByText('Decimals')).not.toBeInTheDocument()
  })

  test('shows decimal toggle for vertical_oscillation', () => {
    render(
      <MetricWidgetEditor widget={makeWidget('vertical_oscillation', { display_unit: 'mm' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />,
    )
    expect(screen.getByText('Decimals')).toBeInTheDocument()
  })

  test('hides decimal toggle for left_right_balance', () => {
    render(
      <MetricWidgetEditor
        widget={makeWidget('left_right_balance', { display_unit: 'percent' })}
        updateWidgetData={vi.fn()}
        setNumericField={vi.fn()}
      />,
    )
    expect(screen.queryByText('Decimals')).not.toBeInTheDocument()
  })
})

describe('MetricWidgetEditor distance formatting controls', () => {
  test('toggles show_full_distance for distance widgets', async () => {
    const user = userEvent.setup()
    const updateWidgetData = vi.fn()

    render(
      <MetricWidgetEditor
        widget={makeWidget('distance', { display_unit: 'km', decimals: 1, show_full_distance: true })}
        updateWidgetData={updateWidgetData}
        setNumericField={vi.fn()}
      />,
    )

    const showFullDistanceRow = screen.getByText('Show Full Distance').closest('div')
    const showFullDistanceSwitch = showFullDistanceRow?.parentElement?.querySelector('[role="switch"]')

    expect(showFullDistanceSwitch).not.toBeNull()
    await user.click(showFullDistanceSwitch)
    expect(updateWidgetData).toHaveBeenCalledWith('value-0', { show_full_distance: false })
  })
})

describe('MetricWidgetEditor balance format', () => {
  test('shows balance format label for left_right_balance', () => {
    render(
      <MetricWidgetEditor
        widget={makeWidget('left_right_balance', { display_unit: 'percent' })}
        updateWidgetData={vi.fn()}
        setNumericField={vi.fn()}
      />,
    )
    expect(screen.getByText('Balance Format')).toBeInTheDocument()
  })

  test('defaults to 52%/48% for left_right_balance', () => {
    render(
      <MetricWidgetEditor
        widget={makeWidget('left_right_balance', { display_unit: 'percent', balance_format: 'percent_label' })}
        updateWidgetData={vi.fn()}
        setNumericField={vi.fn()}
      />,
    )
    expect(screen.getByText('52%/48%')).toBeInTheDocument()
  })

  test('does not show balance format for non-balance widgets', () => {
    render(<MetricWidgetEditor widget={makeWidget('g_force', { display_unit: 'g' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.queryByText('Balance Format')).not.toBeInTheDocument()
  })
})

describe('MetricWidgetEditor linear gauge controls', () => {
  test('shows display type selector for metrics with multiple display types', () => {
    render(<MetricWidgetEditor widget={makeWidget('heading', { display_type: 'text' })} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)
    expect(screen.getByText('Display Type')).toBeInTheDocument()
  })

  test('renders linear gauge controls and dispatches variant updates', async () => {
    const user = userEvent.setup()
    const updateWidgetData = vi.fn()
    render(
      <MetricWidgetEditor
        widget={makeWidget('speed', {
          display_type: 'linear',
          display_unit: 'kmh',
          display_variants: {
            linear: {
              width: 200,
              height: 60,
              rotation: 0,
              orientation: 'horizontal',
              track_corner_radius: 6,
              track_border_thickness: 2,
              track_border_color: '#ffffff',
              track_empty_color: '#222222',
              track_empty_opacity: 0.5,
              track_filled_color: '#40e0d0',
              track_filled_opacity: 1,
              track_fill_flat: false,
              show_min_max_labels: false,
              min_max_label_font: 'Arial.ttf',
              min_max_label_font_size: 12,
              min_max_label_color: '#ffffff',
            },
          },
        })}
        updateWidgetData={updateWidgetData}
        setNumericField={vi.fn()}
      />,
    )

    expect(screen.getByText('Gauge Track')).toBeInTheDocument()
    expect(screen.getByText('Orientation')).toBeInTheDocument()
    expect(screen.getByText('Min/Max Labels')).toBeInTheDocument()

    await user.click(screen.getAllByRole('switch')[1])
    expect(updateWidgetData).toHaveBeenCalledWith(
      'value-0',
      expect.objectContaining({
        display_variants: expect.objectContaining({
          linear: expect.objectContaining({ show_min_max_labels: true }),
        }),
      }),
    )
  })
})

describe('MetricWidgetEditor arc gauge controls', () => {
  test('renders arc geometry, inner-widget, and shared track controls without an icon section', async () => {
    const user = userEvent.setup()
    const updateWidgetData = vi.fn()
    render(
      <MetricWidgetEditor
        widget={makeWidget('speed', {
          display_type: 'arc',
          font: 'Arial.ttf',
          font_size: 40,
          color: '#ffffff',
          show_units: true,
          unit_color: '#ffffff',
          display_unit: 'kmh',
          display_variants: {
            arc: {
              width: 160,
              height: 160,
              rotation: 0,
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
              show_min_max_labels: false,
              min_max_label_font: 'Arial.ttf',
              min_max_label_font_size: 12,
              min_max_label_color: '#ffffff',
            },
          },
        })}
        updateWidgetData={updateWidgetData}
        setNumericField={vi.fn()}
      />,
    )

    expect(screen.getByText('Arc Track')).toBeInTheDocument()
    expect(screen.getByText('Arc Angle')).toBeInTheDocument()
    expect(screen.getByText('Inner Label')).toBeInTheDocument()
    expect(screen.getByText('Inner Unit')).toBeInTheDocument()
    expect(screen.getByText('Flat')).toBeInTheDocument()
    expect(screen.queryByText('Icon')).not.toBeInTheDocument()

    await user.click(screen.getByText('Flat').parentElement.querySelector('[role="switch"]'))
    expect(updateWidgetData).toHaveBeenCalledWith(
      'value-0',
      expect.objectContaining({
        display_variants: expect.objectContaining({
          arc: expect.objectContaining({ track_fill_flat: true }),
        }),
      }),
    )

    const switches = screen.getAllByRole('switch')
    await user.click(switches[switches.length - 1])
    expect(updateWidgetData).toHaveBeenCalledWith(
      'value-0',
      expect.objectContaining({
        display_variants: expect.objectContaining({
          arc: expect.objectContaining({ show_min_max_labels: true }),
        }),
      }),
    )
  })
})

describe('MetricWidgetEditor corner gauge controls', () => {
  test('keeps corner settings in the corner variant and exposes bottom-corner orientation', () => {
    const updateWidgetData = vi.fn()
    render(
      <MetricWidgetEditor
        widget={makeWidget('speed', {
          display_type: 'corner',
          font: 'Arial.ttf',
          font_size: 40,
          color: '#ffffff',
          show_units: true,
          unit_color: '#ffffff',
          display_unit: 'kmh',
          display_variants: {
            corner: {
              width: 160,
              height: 160,
              rotation: 0,
              corner_orientation: 'bottom-left',
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
              show_min_max_labels: false,
              min_max_label_font: 'Arial.ttf',
              min_max_label_font_size: 12,
              min_max_label_color: '#ffffff',
            },
          },
        })}
        updateWidgetData={updateWidgetData}
        setNumericField={vi.fn()}
      />,
    )

    expect(screen.getByText('Corner Track')).toBeInTheDocument()
    expect(screen.getByText('Corner Orientation')).toBeInTheDocument()
    expect(screen.queryByText('Arc Angle')).not.toBeInTheDocument()

    expect(screen.getByText('Bottom Left')).toBeInTheDocument()
  })
})
