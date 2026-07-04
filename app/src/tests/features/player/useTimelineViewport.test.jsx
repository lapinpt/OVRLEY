import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import useTimelineViewport from '@/features/player/hooks/useTimelineViewport'

function createMeasuredElement(width = 500) {
  return {
    getBoundingClientRect: () => ({
      left: 0,
      width,
    }),
  }
}

describe('useTimelineViewport', () => {
  test('initializes to full range and re-fits when totalDuration changes', () => {
    const { result, rerender } = renderHook(([totalDuration]) => useTimelineViewport({ totalDuration }), { initialProps: [100] })

    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 100 })

    act(() => {
      rerender([200])
    })

    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 200 })
  })

  test('zooms around the current playhead and can reset to full range', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100, playheadSecond: 50 }))

    act(() => {
      result.current.zoomIn()
    })

    const zoomedSpan = result.current.viewport.viewEnd - result.current.viewport.viewStart
    expect(zoomedSpan).toBeCloseTo(100 / 1.6)

    act(() => {
      result.current.zoomOut()
    })

    expect(result.current.viewport.viewEnd - result.current.viewport.viewStart).toBeGreaterThan(zoomedSpan)

    act(() => {
      result.current.resetView()
    })

    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 100 })
  })

  test('fits to available video and activity targets and derives the displayed target', () => {
    const { result } = renderHook(() =>
      useTimelineViewport({
        activityDurationSeconds: 45,
        hasActivityData: true,
        hasVideo: true,
        importedVideoDuration: 20,
        totalDuration: 100,
        videoSyncOffsetSeconds: 10,
      }),
    )

    expect(result.current.fitTargets.map((target) => target.id)).toEqual(['all', 'video', 'activity'])
    expect(result.current.displayedFitTargetId).toBe('all')

    act(() => {
      result.current.fitTarget('video')
    })

    expect(result.current.viewport.viewStart).toBeCloseTo(9.2)
    expect(result.current.viewport.viewEnd).toBeCloseTo(30.8)
    expect(result.current.displayedFitTargetId).toBe('video')

    act(() => {
      result.current.fitTarget('activity')
    })

    expect(result.current.viewport.viewStart).toBe(0)
    expect(result.current.viewport.viewEnd).toBeCloseTo(48.6)
    expect(result.current.displayedFitTargetId).toBe('activity')
  })

  test('resets to full range when media shape changes instead of keeping stale fit state', () => {
    const { result, rerender } = renderHook(
      ([videoSyncOffsetSeconds]) =>
        useTimelineViewport({
          hasVideo: true,
          importedVideoDuration: 20,
          totalDuration: 100,
          videoSyncOffsetSeconds,
        }),
      { initialProps: [10] },
    )

    act(() => {
      result.current.fitTarget('video')
    })

    expect(result.current.displayedFitTargetId).toBe('video')

    act(() => {
      rerender([20])
    })

    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 100 })
    expect(result.current.displayedFitTargetId).toBe('all')
  })

  test('pans by seconds and clamps when panning past the end', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100, playheadSecond: 50 }))

    act(() => {
      result.current.zoomIn()
    })

    const span = result.current.viewport.viewEnd - result.current.viewport.viewStart

    act(() => {
      result.current.panBy(1000)
    })

    expect(result.current.viewport.viewEnd).toBe(100)
    expect(result.current.viewport.viewStart).toBe(100 - span)
  })

  test('Ctrl+wheel zooms at the pointer position and plain wheel is a no-op', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100 }))
    const preventDefault = vi.fn()

    act(() => {
      result.current.containerRef(createMeasuredElement(100))
    })

    act(() => {
      result.current.handleWheel({ clientX: 25, ctrlKey: false, deltaY: -100, preventDefault })
    })
    expect(preventDefault).not.toHaveBeenCalled()
    expect(result.current.viewport).toEqual({ viewStart: 0, viewEnd: 100 })

    act(() => {
      result.current.handleWheel({ clientX: 25, ctrlKey: true, deltaY: -100, preventDefault })
    })

    expect(preventDefault).toHaveBeenCalled()
    expect(result.current.viewport.viewEnd - result.current.viewport.viewStart).toBeCloseTo(100 / 1.6)
  })

  test('starts measuring when the timeline element appears after an initial null render', () => {
    const { result } = renderHook(() => useTimelineViewport({ totalDuration: 100 }))

    expect(result.current.widthPx).toBe(0)

    act(() => {
      result.current.containerRef(createMeasuredElement(500))
    })

    expect(result.current.widthPx).toBe(500)
    expect(result.current.ticks.major.length).toBeGreaterThan(0)

    act(() => {
      result.current.containerRef(null)
    })

    expect(result.current.widthPx).toBe(0)
  })

  test('follows the playhead while playing and suspends follow during drag', () => {
    const { result, rerender } = renderHook(
      ([isPlaying, playheadSecond, isDragging]) =>
        useTimelineViewport({
          isDragging,
          isPlaying,
          playheadSecond,
          totalDuration: 200,
        }),
      { initialProps: [true, 0, false] },
    )

    act(() => {
      result.current.zoomIn()
      result.current.zoomIn()
    })

    const beforeDrag = { ...result.current.viewport }

    act(() => {
      rerender([true, 500, true])
    })

    expect(result.current.viewport).toEqual(beforeDrag)

    act(() => {
      rerender([true, 160, false])
    })

    expect(result.current.viewport.viewStart).not.toBe(beforeDrag.viewStart)
  })
})
