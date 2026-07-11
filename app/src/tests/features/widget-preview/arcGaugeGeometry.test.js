import { describe, expect, test } from 'vitest'
import {
  getArcAngles,
  getArcFilledTrackPath,
  getArcFilledTrackRevealSpec,
  getArcGaugeLayout,
  getArcInnerWidgetLayout,
  getArcRadius,
} from '@/features/widget-preview/utils/arcGaugeGeometry'

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

  test('centers the dynamic value from its advance, not its glyph bounds', () => {
    const layout = getArcInnerWidgetLayout({
      centerX: 100,
      centerY: 80,
      fontSize: 40,
      // Two equal-advance digit runs can have different ink side-bearings.
      // The origin must remain at 80 for either one.
      valueMeasure: { width: 40, boundsLeft: -4, boundsRight: 36, glyphHeight: 28, ascent: 22, descent: 6 },
      valueVerticalMeasure: { glyphHeight: 28, ascent: 22, descent: 6 },
    })

    expect(layout.value.x).toBe(80)
  })

  test('builds one closed filled outline with continuous endpoint fillets', () => {
    const shared = {
      centerX: 80,
      centerY: 80,
      radius: 64,
      startAngle: 180,
      sweepAngle: 180,
      trackThickness: 12,
    }
    const flat = getArcFilledTrackPath({ ...shared, cornerRadius: 0 })
    const partial = getArcFilledTrackPath({ ...shared, cornerRadius: 3 })
    const round = getArcFilledTrackPath({ ...shared, cornerRadius: 6 })
    const rightFlat = getArcFilledTrackPath({ ...shared, cornerRadius: 6, endCornerRadius: 0 })

    expect(flat).toMatch(/^M /)
    expect(flat).toMatch(/ Z$/)
    expect(partial).not.toBe(flat)
    expect(round).not.toBe(partial)
    expect(rightFlat).not.toBe(flat)
    expect(rightFlat).not.toBe(round)
  })

  test('keeps any positive rounded fill drawable while reserving no path for zero', () => {
    const shared = {
      centerX: 80,
      centerY: 80,
      radius: 64,
      startAngle: 180,
      trackThickness: 12,
      cornerRadius: 6,
    }

    expect(getArcFilledTrackPath({ ...shared, sweepAngle: 0 })).toBe('')
    expect(getArcFilledTrackPath({ ...shared, sweepAngle: 0.0001 })).toMatch(/^M /)
    expect(getArcFilledTrackPath({ ...shared, sweepAngle: 0.0001, endCornerRadius: 0 })).toMatch(/^M /)
  })

  test('reveals a full track from its left edge while keeping the moving end rounded', () => {
    const lowFill = getArcFilledTrackRevealSpec({
      radius: 64,
      startAngle: 180,
      sweepAngle: 180,
      startCornerRadius: 6,
      endCornerRadius: 6,
      fill: 0.001,
    })
    const halfway = getArcFilledTrackRevealSpec({
      radius: 64,
      startAngle: 180,
      sweepAngle: 180,
      startCornerRadius: 6,
      endCornerRadius: 6,
      fill: 0.5,
    })

    expect(lowFill.startAngle).toBeCloseTo(174.644, 3)
    expect(lowFill.startCornerRadius).toBe(0)
    expect(lowFill.endCornerRadius).toBeGreaterThan(0)
    expect(lowFill.endCornerRadius).toBeLessThan(6)
    expect(halfway.sweepAngle).toBeCloseTo(90, 3)
    expect(halfway.endCornerRadius).toBe(6)
  })
})
