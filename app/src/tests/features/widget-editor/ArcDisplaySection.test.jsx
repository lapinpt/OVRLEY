import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ArcDisplaySection from '@/features/widget-editor/components/metricWidget/ArcDisplaySection'

vi.mock('@/features/scene-settings/hooks/useAvailableFonts', () => ({
  default: () => ({ recommendedFonts: [], systemFonts: [] }),
}))

vi.mock('@/components/ui/font-select-field', () => ({ default: () => null }))

vi.mock('@/features/widget-editor/components/widgetEditorSections', () => ({
  FontSection: () => null,
  SectionHeading: ({ title }) => <h2>{title}</h2>,
  UnitsControlRow: () => null,
}))

vi.mock('@/features/widget-editor/components/widgetFormControls', () => ({
  ColorField: () => null,
  SelectField: () => null,
  SliderField: ({ label, onSliderChange }) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (label !== 'Size') return
        onSliderChange(320)
      }}
    >
      {label}
    </button>
  ),
  ToggleField: () => null,
}))

function makeGaugeWidget(displayType = 'arc') {
  return {
    id: 'arc-1',
    type: 'speed',
    data: {
      display_type: displayType,
      font_size: 40,
      display_variants: {
        [displayType]: {
          width: 160,
          height: 160,
          arc_angle: 180,
          track_thickness: 12,
          track_corner_radius: 6,
          track_border_thickness: 2,
          inner_widget_offset_x: 4,
          inner_widget_offset_y: -2,
          min_max_label_font_size: 10,
        },
      },
    },
  }
}

describe('ArcDisplaySection', () => {
  test('replaces width and height with one Size control', () => {
    render(<ArcDisplaySection widget={makeGaugeWidget()} updateWidgetData={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Size' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Width' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Height' })).not.toBeInTheDocument()
  })

  test('scales frame and arc content using the resize-handle policy', async () => {
    const user = userEvent.setup()
    const updateWidgetData = vi.fn()

    render(<ArcDisplaySection widget={makeGaugeWidget()} updateWidgetData={updateWidgetData} />)
    await user.click(screen.getByRole('button', { name: 'Size' }))

    expect(updateWidgetData).toHaveBeenLastCalledWith(
      'arc-1',
      expect.objectContaining({
        width: 320,
        height: 320,
        font_size: 80,
        display_variants: expect.objectContaining({
          arc: expect.objectContaining({
            width: 320,
            height: 320,
            track_thickness: 24,
            track_corner_radius: 12,
            track_border_thickness: 4,
            inner_widget_offset_x: 8,
            inner_widget_offset_y: -4,
            min_max_label_font_size: 20,
          }),
        }),
      }),
    )
  })

  test('scales corner-gauge content from the same Size control', async () => {
    const user = userEvent.setup()
    const updateWidgetData = vi.fn()

    render(<ArcDisplaySection widget={makeGaugeWidget('corner')} updateWidgetData={updateWidgetData} />)
    await user.click(screen.getByRole('button', { name: 'Size' }))

    expect(updateWidgetData).toHaveBeenLastCalledWith(
      'arc-1',
      expect.objectContaining({
        width: 320,
        height: 320,
        font_size: 80,
        display_variants: expect.objectContaining({
          corner: expect.objectContaining({
            width: 320,
            height: 320,
            track_thickness: 24,
            track_corner_radius: 12,
            track_border_thickness: 4,
            inner_widget_offset_x: 8,
            inner_widget_offset_y: -4,
            min_max_label_font_size: 20,
          }),
        }),
      }),
    )
  })
})
