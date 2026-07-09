import { describe, expect, test } from 'vitest'
import { getArcAngles, getArcGaugeLayout, getArcInnerWidgetLayout, getArcRadius } from '@/features/widget-preview/utils/arcGaugeGeometry'

describe('arcGaugeGeometry', () => {
  test('uses vertically symmetric start and end angles for the supported range', () => {
    expect(getArcAngles(30)).toEqual({ startAngle: 255, endAngle: 285, sweepAngle: 30 })
    expect(getArcAngles(180)).toEqual({ startAngle: 180, endAngle: 360, sweepAngle: 180 })
    expect(getArcAngles(360)).toEqual({ startAngle: 90, endAngle: 450, sweepAngle: 360 })
  })

  test('derives radius from the smaller frame dimension and outer stroke', () => {
    expect(getArcRadius({ width: 200, height: 160, trackThickness: 12, borderThickness: 2 })).toBe(72)
    expect(getArcRadius({ width: 40, height: 80, trackThickness: 30, borderThickness: 8 })).toBe(0)
  })

  test('uses a 50 percent placeholder and sweeps left to right over a half-circle', () => {
    const layout = getArcGaugeLayout({
      value: null,
      values: [],
      width: 160,
      height: 160,
      arcAngle: 180,
      trackThickness: 12,
      borderThickness: 2,
    })

    expect(layout.fill).toBe(0.5)
    expect(layout.startPoint.x).toBeCloseTo(8)
    expect(layout.startPoint.y).toBeCloseTo(80)
    expect(layout.endPoint.x).toBeCloseTo(152)
    expect(layout.endPoint.y).toBeCloseTo(80)
    expect(layout.fillEndPoint.x).toBeCloseTo(80)
    expect(layout.fillEndPoint.y).toBeCloseTo(8)
  })

  test('stacks the unit below a horizontally centered value with unconstrained offsets', () => {
    const layout = getArcInnerWidgetLayout({
      centerX: 80,
      centerY: 80,
      offsetX: 18,
      offsetY: -12,
      fontSize: 40,
      valueMeasure: { width: 40, boundsLeft: 0, boundsRight: 40, glyphHeight: 28, ascent: 22, descent: 6 },
      valueVerticalMeasure: { glyphHeight: 28, ascent: 22, descent: 6 },
      unitMeasure: { width: 30, boundsLeft: 0, boundsRight: 30, glyphHeight: 10, ascent: 8, descent: 2 },
      showUnit: true,
    })

    expect(layout.value.x).toBe(78)
    expect(layout.unit.x).toBe(83)
    expect(layout.unit.top).toBeGreaterThan(layout.value.top)
    expect(layout.unit.baseline).toBeGreaterThan(layout.value.baseline)
    expect(layout.centerX).toBe(98)
  })
})
