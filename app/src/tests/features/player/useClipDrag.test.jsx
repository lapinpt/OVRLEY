import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import useClipDrag from '@/features/player/hooks/useClipDrag'

function createTarget() {
  return {
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn(),
  }
}

function createEvent(clientX, currentTarget = createTarget()) {
  return {
    button: 0,
    clientX,
    currentTarget,
    pointerId: 1,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
}

function renderDrag(setVideoSyncOffset = vi.fn()) {
  const hook = renderHook(() => useClipDrag({ setVideoSyncOffset }))
  const containerElement = {
    getBoundingClientRect: () => ({ width: 250 }),
  }

  act(() => {
    hook.result.current.updateMetrics({
      activityDurationSeconds: 100,
      containerElement,
      importedVideoDuration: 20,
      videoSyncOffsetSeconds: 5,
      viewEnd: 100,
      viewStart: 0,
      widthPx: 500,
    })
  })

  return { ...hook, setVideoSyncOffset }
}

describe('useClipDrag', () => {
  test('keeps fractional movement live and rounds the committed offset on pointer up', () => {
    const { result, setVideoSyncOffset } = renderDrag()
    const target = createTarget()

    act(() => {
      result.current.getLaneDragProps('video').onPointerDown(createEvent(100, target))
      result.current.getLaneDragProps('video').onPointerMove(createEvent(103, target))
    })

    expect(setVideoSyncOffset).toHaveBeenLastCalledWith(6)

    act(() => {
      result.current.getLaneDragProps('video').onPointerUp(createEvent(103, target))
    })

    expect(setVideoSyncOffset).toHaveBeenLastCalledWith(6.2)
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1)
  })

  test('snaps a clip edge to an alignment guideline within the pixel threshold', () => {
    const { result, setVideoSyncOffset } = renderDrag()
    const target = createTarget()

    act(() => {
      result.current.getLaneDragProps('video').onPointerDown(createEvent(100, target))
      result.current.getLaneDragProps('video').onPointerMove(createEvent(88, target))
    })

    expect(setVideoSyncOffset).toHaveBeenLastCalledWith(0)
    expect(result.current.snapGuidelineSecond).toBe(0)

    act(() => {
      result.current.getLaneDragProps('video').onPointerMove(createEvent(80, target))
    })

    expect(setVideoSyncOffset).toHaveBeenLastCalledWith(-3)
    expect(result.current.snapGuidelineSecond).toBeNull()
  })

  test('restores the initial offset when the pointer drag is cancelled', () => {
    const { result, setVideoSyncOffset } = renderDrag()
    const target = createTarget()

    act(() => {
      result.current.getLaneDragProps('video').onPointerDown(createEvent(100, target))
      result.current.getLaneDragProps('video').onPointerMove(createEvent(103, target))
      result.current.getLaneDragProps('video').onPointerCancel(createEvent(103, target))
    })

    expect(setVideoSyncOffset).toHaveBeenLastCalledWith(5)
  })
})
