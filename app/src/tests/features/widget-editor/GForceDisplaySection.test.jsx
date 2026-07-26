import { beforeAll, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MetricWidgetEditor from '@/features/widget-editor/components/metricWidget/MetricWidgetEditor'
import { createMetricValueDefaults } from '@/features/widget-editor/utils/widgetUtils'

vi.mock('@/features/scene-settings/hooks/useAvailableFonts', () => ({
  default: () => ({ recommendedFonts: [], systemFonts: [] }),
}))

vi.mock('@/features/widget-editor/components/widgetFormControls', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    SliderField: ({ label, value, onSliderChange }) => (
      <button type="button" aria-label={label} onClick={() => onSliderChange(value / 2)}>
        {label}
      </button>
    ),
  }
})

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

describe('GForceWidgetEditor', () => {
  test('shows the geometry, paint, marker, label, and axis controls', () => {
    const widget = {
      id: 'g-force-1',
      type: 'g_force',
      data: createMetricValueDefaults('g_force', { font_values: 'Arial.ttf' }, 'g_force'),
    }
    render(<MetricWidgetEditor widget={widget} updateWidgetData={vi.fn()} setNumericField={vi.fn()} />)

    for (const label of ['Diameter', 'Fill Color', 'Border Thickness', 'Marker Size', 'Label Font', 'Decimals', 'Unit Color']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('Rotation')).not.toBeInTheDocument()
    expect(screen.getByText('Horizontal axis')).toBeInTheDocument()
    expect(screen.getByText('Vertical axis')).toBeInTheDocument()
    expect(screen.getAllByText('Invert')).toHaveLength(2)
  })

  test('scales the frame and all G-force dimensions when diameter changes', () => {
    const widget = {
      id: 'g-force-1',
      type: 'g_force',
      data: createMetricValueDefaults('g_force', { font_values: 'Arial.ttf' }, 'g_force'),
    }
    const updateWidgetData = vi.fn()
    render(<MetricWidgetEditor widget={widget} updateWidgetData={updateWidgetData} setNumericField={vi.fn()} />)

    screen.getByRole('button', { name: 'Diameter' }).click()

    expect(updateWidgetData).toHaveBeenCalledWith(
      'g-force-1',
      expect.objectContaining({
        width: 110,
        height: 110,
        display_variants: expect.objectContaining({
          g_force: expect.objectContaining({
            width: 110,
            height: 110,
            diameter: 100,
            border_thickness: 0,
            marker_size: 12,
            label_font_size: 10,
          }),
        }),
      }),
    )
  })
})
