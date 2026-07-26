import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useGForcePreviewModel } from '@/features/widget-preview/widgets/g-force/useGForcePreview'

const prepareGForcePreview = vi.hoisted(() =>
  vi.fn(() => ({
    times: [0, 1],
    horizontal: [0, 1],
    vertical: [0, 1],
    components: {
      x: [0, 1],
      y: [0, 1],
      z: [0, 1],
    },
    maxG: 1,
  })),
)

vi.mock('@/features/widget-preview/widgets/g-force/model', async (importOriginal) => ({
  ...(await importOriginal()),
  prepareGForcePreview,
}))

function makeWidget() {
  return {
    id: 'g-force-cache-test',
    data: {
      width: 220,
      height: 220,
      diameter: 200,
      border_thickness: 2,
      marker_size: 12,
      axis_horizontal: 'x',
      axis_vertical: 'y',
      invert_horizontal: false,
      invert_vertical: false,
      clip_percentile: 99,
      label_font: 'Arial.ttf',
      label_font_size: 14,
      label_decimals: 1,
      label_unit: 'G',
      label_offset_x: 0,
      label_offset_y: 0,
      opacity: 1,
    },
  }
}

describe('useGForcePreviewModel', () => {
  test('does not rebuild prepared activity data when only preview time changes', () => {
    const activity = { sample_elapsed_seconds: [0, 1], g_force_x: [0, 1], g_force_y: [0, 1] }
    const widget = makeWidget()
    const initialProps = { widget, activity, previewSecond: 0, globalOpacity: 1, globalScale: 1, sceneStyle: {} }
    const { rerender } = renderHook((props) => useGForcePreviewModel(props), { initialProps })

    expect(prepareGForcePreview).toHaveBeenCalledTimes(1)
    rerender({ ...initialProps, previewSecond: 0.5 })
    expect(prepareGForcePreview).toHaveBeenCalledTimes(1)

    const remappedWidget = { ...widget, data: { ...widget.data, axis_horizontal: 'z' } }
    rerender({ ...initialProps, widget: remappedWidget, previewSecond: 0.5 })
    expect(prepareGForcePreview).toHaveBeenCalledTimes(2)
  })
})
