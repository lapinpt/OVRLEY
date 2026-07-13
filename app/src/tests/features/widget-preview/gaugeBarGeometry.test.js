import { describe, expect, test } from 'vitest'
import { getArcBarSegments, getBarFillCount, getBarGeometry, getLinearBarRects, getSuggestedBarGeometry } from '@/features/widget-preview/utils/gaugeBarGeometry'

describe('gaugeBarGeometry', () => {
  test('uses whole-segment bucket thresholds', () => {
    expect(getBarFillCount(0, 5)).toBe(0)
    expect(getBarFillCount(0.1999, 5)).toBe(0)
    expect(getBarFillCount(0.2, 5)).toBe(1)
    expect(getBarFillCount(1, 5)).toBe(5)
  })

  test('suggests geometry from the track size when bars are enabled', () => {
    const compact = getSuggestedBarGeometry({ span: 100, outerThickness: 20 })
    const wide = getSuggestedBarGeometry({ span: 200, outerThickness: 20 })
    expect(wide.count).toBeGreaterThan(compact.count)
    expect(compact.gap).toBe(4)
    expect(wide.gap).toBe(4)
  })

  test('clamps an explicit gap without overflowing the span', () => {
    expect(getBarGeometry({ span: 20, bar_count: 5, bar_gap: 10 })).toEqual({ count: 5, gap: 2.5, extent: 2 })
  })

  test('lays vertical bars out from bottom to top', () => {
    const bars = getLinearBarRects({ width: 20, height: 100, orientation: 'vertical', bar_count: 4, bar_gap: 4 })
    expect(bars.rects[0].y).toBeGreaterThan(bars.rects[3].y)
  })

  test('creates open sub-arcs for a full-circle segmented track', () => {
    const bars = getArcBarSegments({
      radius: 50,
      startAngle: 90,
      sweepAngle: 360,
      trackThickness: 12,
      borderThickness: 2,
      cornerRadius: 6,
      bar_count: 8,
      bar_gap: 4,
    })
    expect(bars.segments).toHaveLength(8)
    expect(bars.segments.every((segment) => Math.abs(segment.sweepAngle) < 360)).toBe(true)
  })
})
