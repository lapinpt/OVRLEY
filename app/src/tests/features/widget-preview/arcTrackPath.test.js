import { describe, expect, test } from 'vitest'
import { getArcFilledTrackPath, getArcFilledTrackRevealSpec, getArcRoundedSegmentPath } from '@/features/widget-preview/widgets/arc-gauge/trackPath'

describe('arcTrackPath', () => {
  test('builds exact flat radial faces and continuous semicircular caps', () => {
    const shared = { centerX: 80, centerY: 80, radius: 64, startAngle: 180, sweepAngle: 180, trackThickness: 12 }
    const flat = getArcFilledTrackPath({ ...shared, cornerRadius: 0 })
    const round = getArcFilledTrackPath({ ...shared, cornerRadius: 6 })
    const rightFlat = getArcFilledTrackPath({ ...shared, cornerRadius: 6, endCornerRadius: 0 })

    expect(flat).toBe(
      'M 10 80 C 10 41.340068 41.340068 10 80 10 C 118.659932 10 150 41.340068 150 80 L 138 80 C 138 47.967485 112.032515 22 80 22 C 47.967485 22 22 47.967485 22 80 L 10 80 Z',
    )
    expect(round).toContain('C 150 83.313708 147.313708 86 144 86 L 144 86 C 140.686292 86 138 83.313708 138 80')
    expect(round).toContain('C 22 83.313708 19.313708 86 16 86 L 16 86 C 12.686292 86 10 83.313708 10 80 Z')
    expect(rightFlat).toContain('L 138 80')
  })

  test('mirrors rounded cap geometry for a counter-clockwise sweep', () => {
    const path = getArcFilledTrackPath({
      centerX: 80,
      centerY: 80,
      radius: 64,
      startAngle: 360,
      sweepAngle: -180,
      trackThickness: 12,
      cornerRadius: 6,
    })

    expect(path).toContain('M 150 80 C 150 41.340068 118.659932 10 80 10')
    expect(path).toContain('C 10 83.313708 12.686292 86 16 86')
    expect(path).toContain('C 147.313708 86 150 83.313708 150 80 Z')
  })

  test('builds full circles as independently closed outer and inner rings', () => {
    const path = getArcFilledTrackPath({
      centerX: 80,
      centerY: 80,
      radius: 64,
      startAngle: 90,
      sweepAngle: 360,
      trackThickness: 12,
      cornerRadius: 6,
    })

    expect(path.match(/ Z/g)).toHaveLength(2)
    expect(path).toContain('M 80 150')
    expect(path).toContain('M 80 138')
  })

  test('keeps any positive rounded fill drawable while reserving no path for zero', () => {
    const shared = { centerX: 80, centerY: 80, radius: 64, startAngle: 180, trackThickness: 12, cornerRadius: 6 }

    expect(getArcFilledTrackPath({ ...shared, sweepAngle: 0 })).toBe('')
    expect(getArcFilledTrackPath({ ...shared, sweepAngle: 0.0001 })).toMatch(/^M /)
    expect(getArcFilledTrackPath({ ...shared, sweepAngle: 0.0001, endCornerRadius: 0 })).toMatch(/^M /)
  })

  test('rounds an annular segment inward while retaining curved outer and inner bodies', () => {
    const shared = { centerX: 80, centerY: 80, radius: 64, startAngle: 180, sweepAngle: 12, trackThickness: 12 }
    const square = getArcRoundedSegmentPath({ ...shared, cornerRadius: 0 })
    const rounded = getArcRoundedSegmentPath({ ...shared, cornerRadius: 6 })

    expect(rounded).not.toBe(square)
    expect(rounded.match(/ C /g).length).toBeGreaterThanOrEqual(6)
    expect(rounded).toMatch(/ L /)
    expect(rounded).toMatch(/ Z$/)
  })

  test('reveals a full track from its left edge while keeping the moving end rounded', () => {
    const shared = { radius: 64, startAngle: 180, sweepAngle: 180, trackThickness: 12, startCornerRadius: 6, endCornerRadius: 6 }
    const lowFill = getArcFilledTrackRevealSpec({ ...shared, fill: 0.001 })
    const halfway = getArcFilledTrackRevealSpec({ ...shared, fill: 0.5 })

    expect(lowFill.capMode).toBe('translate')
    expect(lowFill.cornerRadius).toBe(6)
    expect(lowFill.capOffset).toBeLessThan(0)
    expect(lowFill.capOffset).toBeGreaterThan(-12)
    const atThreshold = getArcFilledTrackRevealSpec({ ...shared, fill: 0.06 })
    expect(atThreshold.capMode).not.toBe('translate')
    expect(atThreshold.startAngle).toBeCloseTo(180 - 5.373, 1)
    expect(halfway.sweepAngle).toBeCloseTo(90, 3)
    expect(halfway.endCornerRadius).toBe(6)
  })
})
