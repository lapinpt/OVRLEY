import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import useTimelineViewport from '@/features/player/hooks/useTimelineViewport'

describe('useTimelineViewport', () => {
  test('initializes to full range [0, totalDuration]', () => {
    const { result } = renderHook(() => useTimelineViewport(100))
    expect(result.current).toEqual({ viewStart: 0, viewEnd: 100 })
  })

  test('re-fits when totalDuration changes', () => {
    const { result, rerender } = renderHook(([dur]) => useTimelineViewport(dur), {
      initialProps: [100],
    })

    act(() => {
      rerender([200])
    })

    expect(result.current).toEqual({ viewStart: 0, viewEnd: 200 })
  })

  test('handles zero totalDuration', () => {
    const { result } = renderHook(() => useTimelineViewport(0))
    expect(result.current).toEqual({ viewStart: 0, viewEnd: 0 })
  })
})
