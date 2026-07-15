/**
 * Tests for WidgetDrawer — verifies the drawer renders and responds to interaction.
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import useStore from '@/store/useStore'
import { cloneSerializable, DEFAULT_CONFIG } from '@/store/store-utils'
import { WidgetDrawer } from '@/features/widget-drawer/components/WidgetDrawer'
import { BACKDROP_RECTANGLE_DEFAULTS } from '@/lib/widget/standard-widgets'

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
    const textOptions = screen.getAllByRole('button', { name: 'Text' })
    await user.click(textOptions[textOptions.length - 1])

    expect(tab).toHaveAttribute('aria-label', 'Open widget drawer')
  })

  test('clicking backdrop creates a rectangle backdrop from manifest defaults', async () => {
    const user = userEvent.setup()
    render(<WidgetDrawer />)

    await user.click(screen.getByRole('button', { name: /drawer/i }))
    await user.click(screen.getByText('Backdrop').closest('button'))
    await user.click(screen.getByRole('button', { name: 'Rectangle' }))

    const [backdrop] = useStore.getState().config.backdrops
    const { width, height, corner_radius, round_top_left, round_top_right, round_bottom_left, round_bottom_right, ...sharedDefaults } =
      BACKDROP_RECTANGLE_DEFAULTS
    expect(backdrop).toMatchObject({
      ...sharedDefaults,
      display_variants: {
        rectangle: { width, height, corner_radius, round_top_left, round_top_right, round_bottom_left, round_bottom_right },
      },
    })
    expect(backdrop.id).toMatch(/^widget-\d+$/)
    expect(useStore.getState().selectedWidgetId).toBe(backdrop.id)
  })
})
