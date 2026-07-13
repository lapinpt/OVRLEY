import { describe, expect, test } from 'vitest'
import {
  getArcBarSegments,
  getBarFillCount,
  getBarGeometry,
  getLinearBarGapMax,
  getLinearBarRects,
  getLinearTrackCornerRadiusMax,
  getArcTrackCornerRadiusMax,
  getSuggestedArcBarGeometry,
  getSuggestedLinearBarGeometry,
} from '@/features/widget-preview/shared/gaugeBarGeometry'

describe('gaugeBarGeometry', () => {
  test('uses whole-segment bucket thresholds', () => {
    expect(getBarFillCount(0, 5)).toBe(0)
    expect(getBarFillCount(0.1999, 5)).toBe(0)
    expect(getBarFillCount(0.2, 5)).toBe(1)
    expect(getBarFillCount(1, 5)).toBe(5)
  })

  test('suggests geometry from the track size when bars are enabled', () => {
    const compact = getSuggestedLinearBarGeometry({ width: 100, height: 20, orientation: 'horizontal' })
    const wide = getSuggestedLinearBarGeometry({ width: 200, height: 20, orientation: 'horizontal' })
    expect(wide.count).toBeGreaterThan(compact.count)
    expect(compact.gap).toBe(4)
    expect(wide.gap).toBe(4)
    expect(Object.values(compact).every(Number.isInteger)).toBe(true)
    expect(Object.values(wide).every(Number.isInteger)).toBe(true)
  })

  test('suggests only whole-number arc geometry and limits', () => {
    const suggestion = getSuggestedArcBarGeometry({ radius: 73.5, sweepAngle: 137, trackThickness: 13.3, borderThickness: 1.2 })
    expect(Object.values(suggestion).every(Number.isInteger)).toBe(true)
  })

  test('scales the whole-pixel gap maximum with track span', () => {
    const compactMax = getLinearBarGapMax({ width: 100, height: 20, orientation: 'horizontal', bar_count: 5 })
    const wideMax = getLinearBarGapMax({ width: 1000, height: 20, orientation: 'horizontal', bar_count: 5 })
    expect(compactMax).toBe(22)
    expect(wideMax).toBe(247)
  })

  test('limits a segmented linear corner radius by one bar width', () => {
    expect(
      getLinearTrackCornerRadiusMax({
        width: 100,
        height: 20,
        orientation: 'horizontal',
        track_fill_style: 'bars',
        bar_count: 10,
        bar_gap: 4,
      }),
    ).toBe(3)
  })

  test('limits a segmented arc corner radius by one segment extent', () => {
    expect(
      getArcTrackCornerRadiusMax({
        radius: 50,
        sweepAngle: 180,
        trackThickness: 12,
        track_fill_style: 'bars',
        bar_count: 20,
        bar_gap: 4,
      }),
    ).toBe(2)
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

  test('keeps segmented arc footprints independent of corner radius', () => {
    const shared = { radius: 50, startAngle: 180, sweepAngle: 180, trackThickness: 12, borderThickness: 2, bar_count: 8, bar_gap: 4 }
    const square = getArcBarSegments({ ...shared, cornerRadius: 0 })
    const rounded = getArcBarSegments({ ...shared, cornerRadius: 6 })

    expect(rounded.segments).toEqual(square.segments)
    expect(rounded.segments[0].sweepAngle).toBeGreaterThan(0.001)
  })
})
