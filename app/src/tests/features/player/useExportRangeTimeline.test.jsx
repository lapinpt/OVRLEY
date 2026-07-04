import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import useExportRangeTimeline from '@/features/player/hooks/useExportRangeTimeline'
import useStore from '@/store/useStore'

function resetStore(exportRange = { fromTime: '00:00:10', toTime: '00:00:20', type: 'custom' }) {
  useStore.setState(useStore.getInitialState(), true)
  useStore.setState({ exportRange })
}

describe('useExportRangeTimeline', () => {
  beforeEach(() => {
    resetStore()
  })

  test('returns custom export markers and highlight range in seconds', () => {
    const { result } = renderHook(() => useExportRangeTimeline({ totalDuration: 60 }))

    expect(result.current.markers).toEqual([
      { label: 'Export in', marker: 'from', second: 10 },
      { label: 'Export out', marker: 'to', second: 20 },
    ])
    expect(result.current.highlightRange).toEqual({ fromSecond: 10, toSecond: 20 })
  })

  test('previews marker movement without writing to the store', () => {
    const { result } = renderHook(() => useExportRangeTimeline({ totalDuration: 60 }))

    act(() => {
      result.current.previewMarker('from', 18.5)
    })

    expect(result.current.highlightRange).toEqual({ fromSecond: 18.5, toSecond: 20 })
    expect(useStore.getState().exportRange.fromTime).toBe('00:00:10')
  })

  test('commits snapped marker movement and avoids redundant writes', () => {
    const { result } = renderHook(() => useExportRangeTimeline({ totalDuration: 60 }))

    act(() => {
      result.current.commitMarker('from', 18.5)
    })

    expect(useStore.getState().exportRange.fromTime).toBe('00:00:19')

    const sameRange = useStore.getState().exportRange
    act(() => {
      result.current.commitMarker('from', 18.5)
    })

    expect(useStore.getState().exportRange).toBe(sameRange)
  })

  test('returns no markers when the export range is not custom', () => {
    resetStore({ fromTime: '00:00:00', toTime: '00:01:00', type: 'full' })

    const { result } = renderHook(() => useExportRangeTimeline({ totalDuration: 60 }))

    expect(result.current.markers).toEqual([])
    expect(result.current.highlightRange).toBeNull()
  })
})
