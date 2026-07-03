import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import TimelineLane from '@/features/player/components/TimelineLane'

const baseProps = {
  clipStart: 0,
  clipDuration: 20,
  durationSeconds: 20,
  formatLabel: 'FIT',
  isVideo: false,
  label: 'ride.fit',
  viewEnd: 100,
  viewStart: 0,
  widthPx: 500,
}

function renderLane(overrides = {}) {
  return render(<TimelineLane {...baseProps} {...overrides} />)
}

describe('TimelineLane', () => {
  test('renders activity source, filename, and duration when the clip is wide enough', () => {
    renderLane()

    expect(screen.getByText('FIT')).toBeInTheDocument()
    expect(screen.getByText('ride.fit')).toBeInTheDocument()
    expect(screen.getByText('00:20')).toBeInTheDocument()
  })

  test('hides text inside clips that are too narrow', () => {
    renderLane({ clipDuration: 2, durationSeconds: 2 })

    expect(screen.queryByText('FIT')).not.toBeInTheDocument()
    expect(screen.queryByText('ride.fit')).not.toBeInTheDocument()
    expect(screen.queryByText('00:02')).not.toBeInTheDocument()
  })

  test('shows full filename and duration in a tooltip on hover', () => {
    renderLane({ clipDuration: 2, durationSeconds: 2 })

    fireEvent.mouseEnter(screen.getByLabelText('ride.fit'))

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('ride.fit')
    expect(tooltip).toHaveTextContent('Duration')
    expect(tooltip).toHaveTextContent('00:02')
    expect(tooltip.closest('[data-testid="timeline-lane-clip-mask"]')).toBeNull()
  })

  test('does not bubble pointer or click events from the clip body', () => {
    const onClick = vi.fn()
    const onPointerDown = vi.fn()
    render(
      <div onClick={onClick} onPointerDown={onPointerDown}>
        <TimelineLane {...baseProps} />
      </div>,
    )

    const clip = screen.getByLabelText('ride.fit')
    fireEvent.pointerDown(clip, { button: 0, clientX: 25, pointerId: 1 })
    fireEvent.click(clip)

    expect(onPointerDown).not.toHaveBeenCalled()
    expect(onClick).not.toHaveBeenCalled()
  })
})
