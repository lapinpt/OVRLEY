import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import OverlayBackdropWidget from '@/features/widget-preview/widgets/backdrop/BackdropPreview'
import { resolveActiveBackdropData } from '@/lib/widget/widget-resolver'

function makeBackdropWidget(data = {}) {
  const widget = {
    id: 'backdrop-1',
    type: 'backdrop',
    category: 'backdrops',
    data: {
      id: 'backdrop-1',
      display_type: 'rectangle',
      x: 0,
      y: 0,
      opacity: 0.75,
      fill_color: '#ff000080',
      fill_opacity: 0.5,
      border_thickness: 4,
      border_color: '#0000ff80',
      border_opacity: 0.25,
      display_variants: {
        rectangle: {
          width: 100,
          height: 60,
          corner_radius: 10,
          round_top_left: true,
          round_top_right: false,
          round_bottom_left: false,
          round_bottom_right: true,
        },
      },
      ...data,
    },
  }
  return { ...widget, data: resolveActiveBackdropData(widget.data) }
}

describe('OverlayBackdropWidget', () => {
  test('renders rectangle fill inset by border thickness with composed opacity attributes', () => {
    render(<OverlayBackdropWidget widget={makeBackdropWidget()} globalOpacity={1} globalScale={2} />)

    const svg = screen.getByTestId('backdrop-preview')
    const fill = screen.getByTestId('backdrop-fill')
    const border = screen.getByTestId('backdrop-border')

    expect(svg).toHaveAttribute('width', '200')
    expect(svg).toHaveAttribute('height', '120')
    expect(svg).toHaveAttribute('viewBox', '0 0 100 60')
    expect(fill).toHaveAttribute('fill', '#ff000080')
    expect(fill).toHaveAttribute('fill-opacity', '0.5')
    expect(fill).toHaveAttribute('opacity', '0.75')
    expect(fill.getAttribute('d')).toContain('M 10 4')
    expect(border).toHaveAttribute('stroke', '#0000ff80')
    expect(border).toHaveAttribute('stroke-opacity', '0.25')
    expect(border).toHaveAttribute('stroke-width', '4')
    expect(border).toHaveAttribute('opacity', '0.75')
    expect(border.getAttribute('d')).toContain('M 12 2')
  })

  test('omits the border path when border thickness is zero without removing fill', () => {
    render(
      <OverlayBackdropWidget
        widget={makeBackdropWidget({
          border_thickness: 0,
          display_variants: {
            rectangle: {
              width: 100,
              height: 60,
              corner_radius: 0,
              round_top_left: false,
              round_top_right: false,
              round_bottom_left: false,
              round_bottom_right: false,
            },
          },
        })}
        globalOpacity={1}
        globalScale={1}
      />,
    )

    expect(screen.getByTestId('backdrop-fill')).toBeInTheDocument()
    expect(screen.queryByTestId('backdrop-border')).toBeNull()
    expect(screen.getByTestId('backdrop-fill').getAttribute('d')).toContain('M 0 0')
  })

  test('renders circle fill and border using diameter as total visual size', () => {
    render(
      <OverlayBackdropWidget
        widget={makeBackdropWidget({
          display_type: 'circle',
          display_variants: {
            circle: { diameter: 100 },
          },
        })}
        globalOpacity={1}
        globalScale={2}
      />,
    )

    const svg = screen.getByTestId('backdrop-preview')
    const fill = screen.getByTestId('backdrop-fill')
    const border = screen.getByTestId('backdrop-border')

    expect(svg).toHaveAttribute('width', '200')
    expect(svg).toHaveAttribute('height', '200')
    expect(svg).toHaveAttribute('viewBox', '0 0 100 100')
    expect(fill).toHaveAttribute('cx', '50')
    expect(fill).toHaveAttribute('cy', '50')
    expect(fill).toHaveAttribute('r', '46')
    expect(fill).toHaveAttribute('fill', '#ff000080')
    expect(fill).toHaveAttribute('fill-opacity', '0.5')
    expect(fill).toHaveAttribute('opacity', '0.75')
    expect(border).toHaveAttribute('r', '48')
    expect(border).toHaveAttribute('stroke', '#0000ff80')
    expect(border).toHaveAttribute('stroke-opacity', '0.25')
    expect(border).toHaveAttribute('stroke-width', '4')
    expect(border).toHaveAttribute('opacity', '0.75')
  })

  test('matches validator corner-radius adjustment when rounded border is thicker than radius', () => {
    render(
      <OverlayBackdropWidget
        widget={makeBackdropWidget({
          border_thickness: 8,
          display_variants: {
            rectangle: {
              width: 100,
              height: 60,
              corner_radius: 4,
              round_top_left: true,
              round_top_right: false,
              round_bottom_left: false,
              round_bottom_right: false,
            },
          },
        })}
        globalOpacity={1}
        globalScale={1}
      />,
    )

    expect(screen.getByTestId('backdrop-border').getAttribute('d')).toContain('M 12 4')
    expect(screen.getByTestId('backdrop-fill').getAttribute('d')).toContain('M 8 8')
  })
})
