import { describe, expect, test } from 'vitest'
import {
  clampExportRangeMarkerSecond,
  getClipGeometry,
  getExportRangeHighlightGeometry,
  pointerToSecond,
  roundToDevicePixel,
  secondsToViewPx,
} from '@/features/player/utils/timelineGeometry'

describe('timelineGeometry utilities', () => {
  test('maps pointer clientX to a clamped timeline second', () => {
    const rect = { left: 100, width: 400 }

    expect(pointerToSecond({ clientX: 300, rect, viewStart: 0, viewEnd: 100, widthPx: 500, totalDuration: 100 })).toBe(50)
    expect(pointerToSecond({ clientX: -50, rect: { left: 0 }, viewStart: 0, viewEnd: 100, widthPx: 500, totalDuration: 100 })).toBe(0)
    expect(pointerToSecond({ clientX: 999, rect: { left: 0 }, viewStart: 0, viewEnd: 100, widthPx: 500, totalDuration: 100 })).toBe(100)
  })

  test('maps timeline seconds to viewport pixels', () => {
    expect(secondsToViewPx({ second: 50, viewStart: 0, viewEnd: 100, widthPx: 500 })).toBe(250)
    expect(secondsToViewPx({ second: 5, viewStart: 10, viewEnd: 10, widthPx: 500 })).toBe(0)
  })

  test('computes visible clip geometry', () => {
    expect(getClipGeometry({ startSecond: 10, durationSeconds: 20, viewStart: 0, viewEnd: 100, widthPx: 500 })).toEqual({
      isVisible: true,
      width: 100,
      x: 50,
    })
    expect(getClipGeometry({ startSecond: 110, durationSeconds: 20, viewStart: 0, viewEnd: 100, widthPx: 500 }).isVisible).toBe(false)
  })

  test('constrains export markers to a one-second minimum gap', () => {
    const base = { fromSecond: 10, toSecond: 20, totalDuration: 60 }

    expect(clampExportRangeMarkerSecond({ ...base, marker: 'from', second: 19.9 })).toBe(19)
    expect(clampExportRangeMarkerSecond({ ...base, marker: 'to', second: 10.2 })).toBe(11)
  })

  test('computes export range highlight geometry inside a clip', () => {
    expect(
      getExportRangeHighlightGeometry({
        durationSeconds: 40,
        exportFromSecond: 20,
        exportToSecond: 35,
        startSecond: 10,
      }),
    ).toEqual({
      isVisible: true,
      leftPercent: 25,
      widthPercent: 37.5,
    })
  })

  test('rounds to the active device pixel grid', () => {
    expect(roundToDevicePixel(10.26, 2)).toBe(10.5)
  })
})
