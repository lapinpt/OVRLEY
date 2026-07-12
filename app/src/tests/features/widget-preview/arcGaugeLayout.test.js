import { describe, expect, test } from 'vitest'
import {
  getArcAngles,
  getArcGaugeLayout,
  getArcRadius,
  getCornerGaugeAngles,
  getCornerGaugeLayout,
} from '@/features/widget-preview/utils/arcGaugeLayout'

describe('arcGaugeLayout', () => {
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
    const layout = getArcGaugeLayout({ width: 160, height: 160, arc_angle: 180, track_thickness: 12, track_border_thickness: 2 }, null, [])

    expect(layout.fill).toBe(0.5)
    expect(layout).toMatchObject({ centerX: 80, centerY: 80, radius: 72, startAngle: 180, endAngle: 360, sweepAngle: 180 })
  })

  test('places each track opposite its gauge corner and reverses bottom-left fill', () => {
    expect(getCornerGaugeAngles('bottom-left')).toEqual({ startAngle: 0, endAngle: -90, sweepAngle: -90 })
    expect(getCornerGaugeAngles('bottom-right')).toEqual({ startAngle: 180, endAngle: 270, sweepAngle: 90 })

    const bottomLeft = getCornerGaugeLayout(
      { width: 160, height: 160, corner_orientation: 'bottom-left', track_thickness: 12, track_corner_radius: 0, track_border_thickness: 2 },
      null,
      [],
    )
    const bottomRight = getCornerGaugeLayout(
      { width: 160, height: 160, corner_orientation: 'bottom-right', track_thickness: 12, track_corner_radius: 0, track_border_thickness: 2 },
      null,
      [],
    )

    expect(bottomLeft).toMatchObject({ centerX: 2, centerY: 158, radius: 150, startAngle: 0, endAngle: -90, sweepAngle: -90 })
    expect(bottomRight).toMatchObject({ centerX: 158, centerY: 158, radius: 150, startAngle: 180, endAngle: 270, sweepAngle: 90 })
  })
})
