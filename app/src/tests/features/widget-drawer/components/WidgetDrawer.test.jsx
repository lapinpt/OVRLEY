/**
 * Tests for WidgetDrawer — verifies the drawer renders and responds to interaction.
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import useStore from '@/store/useStore'
import { cloneSerializable, DEFAULT_CONFIG } from '@/store/store-utils'
import { WidgetDrawer } from '@/features/widget-drawer/components/WidgetDrawer'

beforeEach(() => {
  useStore.setState({
    config: cloneSerializable(DEFAULT_CONFIG),
    selectedWidgetId: null,
    selectedWidgetIds: [],
    widgetDrawerOpen: false,
  })
})

describe('WidgetDrawer', () => {
  test('renders a tab with WIDGETS label when collapsed', () => {
    render(<WidgetDrawer />)

    const tab = screen.getByRole('button', { name: /drawer/i })
    expect(tab).toBeInTheDocument()
    expect(tab).toHaveTextContent('WIDGETS')
  })

  test('clicking the tab opens the drawer', async () => {
    const user = userEvent.setup()
    render(<WidgetDrawer />)

    const tab = screen.getByRole('button', { name: /drawer/i })
    expect(tab).toHaveAttribute('aria-label', 'Open widget drawer')

    await user.click(tab)

    expect(tab).toHaveAttribute('aria-label', 'Close widget drawer')
  })

  test('clicking the tab again closes the drawer', async () => {
    const user = userEvent.setup()
    render(<WidgetDrawer />)

    const tab = screen.getByRole('button', { name: /drawer/i })

    await user.click(tab)
    expect(tab).toHaveAttribute('aria-label', 'Close widget drawer')

    await user.click(tab)
    expect(tab).toHaveAttribute('aria-label', 'Open widget drawer')
  })

  test('pressing Escape closes the drawer when open', async () => {
    const user = userEvent.setup()
    render(<WidgetDrawer />)

    const tab = screen.getByRole('button', { name: /drawer/i })

    await user.click(tab)
    expect(tab).toHaveAttribute('aria-label', 'Close widget drawer')

    await user.keyboard('{Escape}')

    expect(tab).toHaveAttribute('aria-label', 'Open widget drawer')
  })

  test('pressing Escape does nothing when drawer is closed', async () => {
    const user = userEvent.setup()
    render(<WidgetDrawer />)

    const tab = screen.getByRole('button', { name: /drawer/i })
    expect(tab).toHaveAttribute('aria-label', 'Open widget drawer')

    await user.keyboard('{Escape}')

    expect(tab).toHaveAttribute('aria-label', 'Open widget drawer')
  })

  test('clicking the backdrop closes the drawer', async () => {
    const user = userEvent.setup()
    render(<WidgetDrawer />)

    const tab = screen.getByRole('button', { name: /drawer/i })
    await user.click(tab)

    const backdrop = screen.getByTestId('widget-drawer-backdrop')
    await user.click(backdrop)

    expect(tab).toHaveAttribute('aria-label', 'Open widget drawer')
  })

  test('clicking a widget closes the drawer', async () => {
    const user = userEvent.setup()
    render(<WidgetDrawer />)

    const tab = screen.getByRole('button', { name: /drawer/i })
    await user.click(tab)

    await user.click(screen.getByText('HR').closest('button'))

    expect(tab).toHaveAttribute('aria-label', 'Open widget drawer')
  })

  test('clicking backdrop creates a rectangle backdrop from manifest defaults', async () => {
    const user = userEvent.setup()
    render(<WidgetDrawer />)

    await user.click(screen.getByRole('button', { name: /drawer/i }))
    await user.click(screen.getByText('Backdrop').closest('button'))

    const [backdrop] = useStore.getState().config.backdrops
    expect(backdrop).toMatchObject({
      display_type: 'rectangle',
      x: 100,
      y: 100,
      opacity: 1,
      fill_color: '#ffffff',
      fill_opacity: 1,
      border_thickness: 0,
      border_color: '#ffffff',
      border_opacity: 1,
      display_variants: {
        rectangle: {
          width: 200,
          height: 120,
          corner_radius: 0,
          round_top_left: false,
          round_top_right: false,
          round_bottom_left: false,
          round_bottom_right: false,
        },
      },
    })
    expect(backdrop.id).toMatch(/^widget-\d+$/)
    expect(useStore.getState().selectedWidgetId).toBe(backdrop.id)
  })
})
