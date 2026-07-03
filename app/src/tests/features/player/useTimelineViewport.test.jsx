import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import useTimelineViewport from '@/features/player/hooks/useTimelineViewport'

describe('useTimelineViewport', () => {
  test('initializes to full range [0, totalDuration]', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100 }))
    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 100 })
  })

  test('re-fits when totalDuration changes', () => {
    const { result, rerender } = renderHook(([dur]) => useTimelineViewport({ totalDuration: dur }), { initialProps: [100] })

    act(() => {
      rerender([200])
    })

    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 200 })
  })

  test('handles zero totalDuration', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 0 }))
    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 0 })
  })
})

describe('useTimelineViewport - zoomBy', () => {
  test('zoom in shrinks the viewport around the playhead', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100 }))
    act(() => {
      result.current.zoomBy(1, 50)
    })
    const span = result.current.viewport.viewEnd - result.current.viewport.viewStart
    expect(span).toBeCloseTo(100 / 1.6)
  })

  test('zoom out grows the viewport around the playhead', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 200 }))
    act(() => {
      result.current.zoomBy(-1, 50)
    })
    const span = result.current.viewport.viewEnd - result.current.viewport.viewStart
    expect(span).toBeGreaterThan(100)
  })
})

describe('useTimelineViewport - fitAll', () => {
  test('resets to [0, totalDuration]', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100 }))
    act(() => {
      result.current.zoomBy(1, 50)
    })
    act(() => {
      result.current.fitAll()
    })
    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 100 })
  })
})

describe('useTimelineViewport - fitVideo', () => {
  test('fits to the video window', () => {
    const { result } = renderHook(() =>
      useTimelineViewport({
        totalDuration: 100,
        videoSyncOffsetSeconds: 10,
        importedVideoDuration: 20,
      }),
    )
    act(() => {
      result.current.fitVideo()
    })
    const { viewStart, viewEnd } = result.current.viewport
    expect(viewStart).toBeCloseTo(9.2)
    expect(viewEnd).toBeCloseTo(30.8)
  })
})

describe('useTimelineViewport - fitActivity', () => {
  test('fits to the activity duration', () => {
    const { result } = renderHook(() =>
      useTimelineViewport({
        totalDuration: 100,
        activityDurationSeconds: 45,
      }),
    )
    act(() => {
      result.current.fitActivity()
    })
    expect(result.current.viewport.viewStart).toBe(0)
    expect(result.current.viewport.viewEnd).toBeCloseTo(48.6)
  })

  test('falls back to fallbackDurationSeconds when no activity', () => {
    const { result } = renderHook(() =>
      useTimelineViewport({
        totalDuration: 100,
        fallbackDurationSeconds: 30,
      }),
    )
    act(() => {
      result.current.fitActivity()
    })
    expect(result.current.viewport.viewStart).toBe(0)
    expect(result.current.viewport.viewEnd).toBeCloseTo(32.4)
  })
})

describe('useTimelineViewport - resetView', () => {
  test('resetView is equivalent to fitAll and does not move the playhead', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100 }))
    act(() => {
      result.current.zoomBy(1, 50)
    })
    act(() => {
      result.current.resetView()
    })
    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 100 })
  })
})

describe('useTimelineViewport - panBy', () => {
  test('shifts viewport by delta seconds', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 200 }))
    act(() => {
      result.current.zoomBy(1, 50)
    })
    const before = { ...result.current.viewport }
    act(() => {
      result.current.panBy(10)
    })
    expect(result.current.viewport.viewStart).toBeCloseTo(before.viewStart + 10)
    expect(result.current.viewport.viewEnd).toBeCloseTo(before.viewEnd + 10)
  })

  test('is a no-op when the whole timeline fits', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100 }))
    act(() => {
      result.current.panBy(20)
    })
    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 100 })
  })

  test('clamps when panning past the end', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100 }))
    act(() => {
      result.current.zoomBy(1, 50)
    })
    const span = result.current.viewport.viewEnd - result.current.viewport.viewStart
    act(() => {
      result.current.panBy(1000)
    })
    expect(result.current.viewport.viewEnd).toBe(100)
    expect(result.current.viewport.viewStart).toBe(100 - span)
  })
})

describe('useTimelineViewport - followPlayhead effect', () => {
  test('advances viewport when playing and playhead exits right edge', () => {
    const { result, rerender } = renderHook(([isPlaying, playheadSecond]) => useTimelineViewport({ totalDuration: 400, isPlaying, playheadSecond }), {
      initialProps: [true, 0],
    })
    act(() => {
      result.current.zoomBy(1, 0)
      result.current.zoomBy(1, 0)
    })
    const span = result.current.viewport.viewEnd - result.current.viewport.viewStart
    act(() => {
      rerender([true, 160])
    })
    expect(result.current.viewport.viewStart).toBeCloseTo(160 - 0.15 * span)
    expect(result.current.viewport.viewEnd).toBeCloseTo(160 - 0.15 * span + span)
  })

  test('advances viewport when the playhead reaches the right edge', () => {
    const { result, rerender } = renderHook(([isPlaying, playheadSecond]) => useTimelineViewport({ totalDuration: 200, isPlaying, playheadSecond }), {
      initialProps: [true, 0],
    })
    act(() => {
      result.current.zoomBy(1, 0)
      result.current.zoomBy(1, 0)
    })
    const span = result.current.viewport.viewEnd - result.current.viewport.viewStart
    const rightEdge = result.current.viewport.viewEnd
    act(() => {
      rerender([true, rightEdge])
    })
    expect(result.current.viewport.viewStart).toBeCloseTo(rightEdge - 0.15 * span)
  })

  test('does NOT trigger when paused', () => {
    const { result, rerender } = renderHook(([isPlaying, playheadSecond]) => useTimelineViewport({ totalDuration: 200, isPlaying, playheadSecond }), {
      initialProps: [false, 0],
    })
    act(() => {
      result.current.zoomBy(1, 50)
    })
    const before = { ...result.current.viewport }
    act(() => {
      rerender([false, 500])
    })
    expect(result.current.viewport).toEqual(before)
  })

  test('is suspended during an active drag', () => {
    const { result, rerender } = renderHook(
      ([isPlaying, playheadSecond, isDragging]) => useTimelineViewport({ totalDuration: 200, isPlaying, playheadSecond, isDragging }),
      { initialProps: [true, 0, false] },
    )
    act(() => {
      result.current.zoomBy(1, 50)
    })
    const before = { ...result.current.viewport }
    act(() => {
      rerender([true, 500, true])
    })
    expect(result.current.viewport).toEqual(before)
  })
})
