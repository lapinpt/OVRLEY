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
