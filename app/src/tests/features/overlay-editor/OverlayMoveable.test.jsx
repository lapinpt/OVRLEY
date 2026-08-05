import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import OverlayMoveable from '@/features/overlay-editor/components/OverlayMoveable'

const moveableRef = { current: { updateRect: vi.fn() } }
const moveableProps = {
  canResizeSelected: false,
  canRotateSelected: false,
  canScaleSelected: true,
  displayScale: 1,
  elementGuidelines: [],
  geometryVersion: 'initial',
  handlers: {},
  isGroupDragActive: false,
  maintainAspectRatio: false,
  moveableRef,
  sceneElement: document.createElement('div'),
  sceneSize: { width: 1920, height: 1080 },
  selectedTarget: document.createElement('div'),
  selectedTargets: [],
  showEdgeResizeHandles: false,
  snapToGrid: false,
}

vi.mock('react-moveable', () => ({
  default: () => null,
}))

describe('OverlayMoveable geometry updates', () => {
  beforeEach(() => {
    moveableRef.current.updateRect.mockReset()
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('updates once when the geometry signature changes', () => {
    const { rerender } = render(<OverlayMoveable {...moveableProps} />)
    moveableRef.current.updateRect.mockClear()

    act(() => {
      rerender(<OverlayMoveable {...moveableProps} geometryVersion="changed" />)
    })

    expect(moveableRef.current.updateRect).toHaveBeenCalledTimes(1)
  })

  test('does not update when the geometry signature is unchanged', () => {
    const { rerender } = render(<OverlayMoveable {...moveableProps} />)
    moveableRef.current.updateRect.mockClear()

    act(() => {
      rerender(<OverlayMoveable {...moveableProps} />)
    })

    expect(moveableRef.current.updateRect).not.toHaveBeenCalled()
  })
})
