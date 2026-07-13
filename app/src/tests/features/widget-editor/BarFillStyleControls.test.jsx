import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import BarFillStyleControls from '@/features/widget-editor/components/metricWidget/BarFillStyleControls'

describe('BarFillStyleControls', () => {
  test('seeds count and gap only when switching to bars', async () => {
    const user = userEvent.setup()
    const suggestBarGeometry = vi.fn(() => ({ count: 11, gap: 3.6, extent: 12 }))
    const updateVariant = vi.fn()
    render(
      <BarFillStyleControls
        data={{ track_fill_style: 'fill', track_fill_flat: false }}
        suggestBarGeometry={suggestBarGeometry}
        updateVariant={updateVariant}
      />,
    )

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByText('Bars'))

    expect(suggestBarGeometry).toHaveBeenCalledOnce()
    expect(updateVariant).toHaveBeenCalledWith({ track_fill_style: 'bars', bar_count: 11, bar_gap: 3.6 })
  })

  test('does not run the suggestion for an existing bars configuration', () => {
    const suggestBarGeometry = vi.fn()
    render(
      <BarFillStyleControls
        data={{ track_fill_style: 'bars', bar_count: 8, bar_gap: 4 }}
        suggestBarGeometry={suggestBarGeometry}
        updateVariant={vi.fn()}
      />,
    )

    expect(screen.getByText('Bar Count')).toBeInTheDocument()
    expect(screen.getByText('Bar Gap')).toBeInTheDocument()
    expect(suggestBarGeometry).not.toHaveBeenCalled()
  })
})
