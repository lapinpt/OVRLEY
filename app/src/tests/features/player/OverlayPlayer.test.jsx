import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import useStore from '@/store/useStore'

const viewportActions = vi.hoisted(() => ({
  fitActivity: vi.fn(),
  fitAll: vi.fn(),
  fitVideo: vi.fn(),
  panBy: vi.fn(),
  resetView: vi.fn(),
  zoomBy: vi.fn(),
}))

const playbackHandlers = vi.hoisted(() => ({
  handlePause: vi.fn(),
  handlePlay: vi.fn(),
  handleReset: vi.fn(),
  handleStepByDirection: vi.fn(),
  handleTimelineChange: vi.fn(),
  handleTimelineCommit: vi.fn(),
}))

const playbackState = vi.hoisted(() => ({ current: null }))
const viewportState = vi.hoisted(() => ({ current: { viewStart: 0, viewEnd: 100 } }))

vi.mock('@/features/player/hooks/useTimelineViewport', () => ({
  default: vi.fn(() => ({
    viewport: viewportState.current,
    ...viewportActions,
  })),
}))

vi.mock('@/features/player/hooks/usePlaybackEngine', () => ({
  default: vi.fn(() => playbackState.current),
}))

vi.mock('@/features/player/hooks/usePlayerKeyboard', () => ({
  default: vi.fn(),
}))

import OverlayPlayer from '@/features/player/components/OverlayPlayer'
import useTimelineViewport from '@/features/player/hooks/useTimelineViewport'

function setPlaybackState(overrides = {}) {
  playbackState.current = {
    clampedPlayhead: 42,
    displayedPlayhead: 42,
    hasActivity: true,
    importedVideoDuration: 20,
    importedVideoPath: 'C:\\clips\\ride.mp4',
    isPlaying: false,
    totalDuration: 100,
    videoSyncOffsetSeconds: 10,
    ...playbackHandlers,
    ...overrides,
  }
}

function renderPlayer() {
  return render(<OverlayPlayer backgroundMode="black" />)
}

function installResizeObserver() {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback
    }

    observe() {
      this.callback([{ contentRect: { width: 100 } }])
    }

    disconnect() {}
  }
}

function resetStore(activitySummary = { durationSeconds: 100 }) {
  useStore.setState(useStore.getInitialState(), true)
  useStore.setState({
    activitySummary,
    fallbackDurationSeconds: 73,
  })
}

describe('OverlayPlayer S2 toolbar behavior', () => {
  beforeEach(() => {
    installResizeObserver()
    resetStore()
    setPlaybackState()
    viewportState.current = { viewStart: 0, viewEnd: 100 }

    for (const action of Object.values(viewportActions)) action.mockReset()
    for (const handler of Object.values(playbackHandlers)) handler.mockReset()
    useTimelineViewport.mockClear()
  })

  test('passes playback and drag state to the viewport hook for auto-follow', () => {
    setPlaybackState({ clampedPlayhead: 88, isPlaying: true })

    renderPlayer()

    expect(useTimelineViewport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDragging: false,
        isPlaying: true,
        playheadSecond: 88,
      }),
    )
  })

  test('zoom buttons pivot at the current playhead', () => {
    renderPlayer()

    fireEvent.click(screen.getByLabelText('Zoom out'))
    fireEvent.click(screen.getByLabelText('Zoom in'))

    expect(viewportActions.zoomBy).toHaveBeenNthCalledWith(1, -1, 42)
    expect(viewportActions.zoomBy).toHaveBeenNthCalledWith(2, 1, 42)
  })

  test('Ctrl+wheel zooms at the pointer position and plain wheel is a no-op', () => {
    viewportState.current = { viewStart: 20, viewEnd: 60 }
    renderPlayer()

    const timeline = screen.getByRole('group', { name: 'Timeline' })
    vi.spyOn(timeline, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      width: 100,
    })

    fireEvent.wheel(timeline, { clientX: 60, ctrlKey: false, deltaY: -100 })
    expect(viewportActions.zoomBy).not.toHaveBeenCalled()

    fireEvent.wheel(timeline, { clientX: 60, ctrlKey: true, deltaY: -100 })
    expect(viewportActions.zoomBy).toHaveBeenCalledWith(1, 40)
  })

  test('hidden active Video tab falls back to All and resets the viewport', async () => {
    const { rerender } = renderPlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Video' }))
    await waitFor(() => expect(viewportActions.fitVideo).toHaveBeenCalled())

    viewportActions.fitAll.mockClear()
    setPlaybackState({ importedVideoPath: null })
    rerender(<OverlayPlayer backgroundMode="black" />)

    await waitFor(() => expect(viewportActions.fitAll).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('button', { name: 'Video' })).not.toBeInTheDocument()
  })

  test('hidden active Activity tab falls back to All and resets the viewport', async () => {
    const { rerender } = renderPlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    await waitFor(() => expect(viewportActions.fitActivity).toHaveBeenCalled())

    viewportActions.fitAll.mockClear()
    act(() => {
      useStore.setState({ activitySummary: null })
    })
    rerender(<OverlayPlayer backgroundMode="black" />)

    await waitFor(() => expect(viewportActions.fitAll).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.queryByRole('button', { name: 'Activity' })).not.toBeInTheDocument()
  })

  test('rewind to end composes existing scrub handlers with total duration', () => {
    renderPlayer()

    fireEvent.click(screen.getByLabelText('Rewind to end'))

    expect(playbackHandlers.handleTimelineChange).toHaveBeenCalledWith([100])
    expect(playbackHandlers.handleTimelineCommit).toHaveBeenCalledWith([100])
  })

  test('scrub drag suspends viewport follow until the drag commits', async () => {
    renderPlayer()

    const axis = screen.getByRole('group', { name: 'Timeline axis' })
    vi.spyOn(axis, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 })

    fireEvent.pointerDown(axis, { button: 0, clientX: 25, pointerId: 1 })
    await waitFor(() => {
      expect(useTimelineViewport).toHaveBeenLastCalledWith(expect.objectContaining({ isDragging: true }))
    })
    expect(playbackHandlers.handleTimelineChange).toHaveBeenCalledWith([25])

    fireEvent.pointerUp(axis, { clientX: 25, pointerId: 1 })
    await waitFor(() => {
      expect(useTimelineViewport).toHaveBeenLastCalledWith(expect.objectContaining({ isDragging: false }))
    })
    expect(playbackHandlers.handleTimelineCommit).toHaveBeenCalledWith([25])
  })

  test('dragging the lane background pans by the pixel delta converted to seconds', async () => {
    renderPlayer()

    const panSurface = screen.getByRole('group', { name: 'Timeline lane background' })

    fireEvent.pointerDown(panSurface, { button: 0, clientX: 70, pointerId: 1 })
    await waitFor(() => {
      expect(useTimelineViewport).toHaveBeenLastCalledWith(expect.objectContaining({ isDragging: true }))
    })

    fireEvent.pointerMove(panSurface, { clientX: 60, pointerId: 1 })
    expect(viewportActions.panBy).toHaveBeenCalledWith(10)

    fireEvent.pointerUp(panSurface, { clientX: 60, pointerId: 1 })
    await waitFor(() => {
      expect(useTimelineViewport).toHaveBeenLastCalledWith(expect.objectContaining({ isDragging: false }))
    })
  })
})
