import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import useOverlayPlayer from '@/features/player/hooks/useOverlayPlayer'
import useStore from '@/store/useStore'

function createTimelineElement(width = 500) {
  return {
    getBoundingClientRect: () => ({
      left: 0,
      width,
    }),
  }
}

function resetStore(overrides = {}) {
  useStore.setState(useStore.getInitialState(), true)
  useStore.setState({
    activityFilename: 'ride.fit',
    activitySummary: {
      durationSeconds: 100,
      fileFormat: 'fit',
      fileName: 'activity.fit',
    },
    fallbackDurationSeconds: 73,
    importedVideoDuration: 20,
    importedVideoPath: 'C:\\clips\\ride.mp4',
    selectedSecond: 0,
    videoSyncOffsetSeconds: 10,
    ...overrides,
  })
}

describe('useOverlayPlayer', () => {
  beforeEach(() => {
    resetStore()
  })

  test('builds the top-level toolbar and timeline view models', () => {
    const { result } = renderHook(() => useOverlayPlayer({ backgroundMode: 'black' }))

    expect(result.current.isVisible).toBe(true)
    expect(result.current.toolbar.fitTargets.map((target) => target.id)).toEqual(['all', 'video', 'activity'])
    expect(result.current.timeline.lanes.map((lane) => lane.id)).toEqual(['video', 'activity'])
  })

  test('routes toolbar transport commands through store playback state', () => {
    const { result } = renderHook(() => useOverlayPlayer({ backgroundMode: 'black' }))

    act(() => {
      result.current.toolbar.transport.stepForward()
    })

    expect(useStore.getState().selectedSecond).toBe(1)

    act(() => {
      result.current.toolbar.transport.jumpToEnd()
    })

    expect(useStore.getState().selectedSecond).toBe(100)
    expect(useStore.getState().previewPlaybackState).toBe('paused')
  })

  test('measures timeline after mount, shows clip geometry, and drags the playhead by timeline coordinates', () => {
    const { result } = renderHook(() => useOverlayPlayer({ backgroundMode: 'black' }))

    expect(result.current.timeline.widthPx).toBe(0)
    expect(result.current.timeline.lanes[0].isVisible).toBe(false)

    act(() => {
      result.current.timeline.containerProps.ref(createTimelineElement(500))
    })

    expect(result.current.timeline.widthPx).toBe(500)
    expect(result.current.timeline.lanes[0].isVisible).toBe(true)
    expect(result.current.timeline.lanes[0].clipStyle.width).not.toBe('0%')

    act(() => {
      result.current.timeline.playhead.handleProps.onPointerDown({
        button: 0,
        clientX: 250,
        currentTarget: {
          hasPointerCapture: () => true,
          releasePointerCapture: () => {},
          setPointerCapture: () => {},
        },
        pointerId: 1,
        stopPropagation: () => {},
      })
    })

    expect(useStore.getState().selectedSecond).toBe(50)
    expect(result.current.timeline.playhead.style.left).toBe(250)
  })
})
