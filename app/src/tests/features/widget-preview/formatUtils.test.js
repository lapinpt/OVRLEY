import { describe, expect, test } from 'vitest'

import { getGradientWidgetLayout } from '@/features/widget-preview/widgets/metric/format'

describe('getGradientWidgetLayout', () => {
  test('uses the full gradient angle when computing triangle height', () => {
    const width = 72
    const expected = width * Math.tan((10 * Math.PI) / 180)

    const layout = getGradientWidgetLayout({
      fontSize: 20,
      fontFamily: 'Arial',
      valueText: '+10%',
      valueOffset: 0,
      gradientValue: 10,
      triangleWidth: width,
      showTriangle: true,
      scale: 1,
    })

    expect(layout.triangle.height).toBeCloseTo(expected, 6)
  })

  test('uses zero height for a zero gradient', () => {
    const layout = getGradientWidgetLayout({
      fontSize: 20,
      fontFamily: 'Arial',
      valueText: '0%',
      valueOffset: 0,
      gradientValue: 0,
      triangleWidth: 72,
      showTriangle: true,
      scale: 1,
    })

    expect(layout.triangle.height).toBe(0)
  })
})
