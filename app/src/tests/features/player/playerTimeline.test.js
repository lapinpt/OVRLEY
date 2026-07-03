/**
 * Regression tests for player timeline helpers.
 *
 * These helpers define which clock owns preview playback and how far the
 * playable range extends when imported video sits beyond activity timing.
 */

import { describe, expect, test } from 'vitest'
import {
  clampToView,
  computeTimelineTicks,
  fitRangeToViewport,
  fitToFull,
  getTotalPlaybackDuration,
  pointerToSecond,
  resolvePlaybackSource,
  secondsToViewPx,
  zoomRange,
} from '@/features/player/utils/playerTimeline'

describe('playerTimeline helpers', () => {
  test('extends total playback duration to include the imported video end', () => {
    expect(
      getTotalPlaybackDuration({
        activityDurationSeconds: 12,
        fallbackDurationSeconds: 9,
        importedVideoDuration: 6,
        importedVideoPath: 'C:\\clips\\ride.mp4',
        videoSyncOffsetSeconds: 10,
      }),
    ).toBe(16)
  })

  test('does not let fallback duration extend a real activity timeline', () => {
    expect(
      getTotalPlaybackDuration({
        activityDurationSeconds: 2.509,
        fallbackDurationSeconds: 73,
        importedVideoDuration: 2.509,
        importedVideoPath: 'C:\\clips\\GoPro-telemetry.MP4',
        videoSyncOffsetSeconds: 0,
      }),
    ).toBe(2.509)
  })

  test('keeps video-clock playback scoped to the imported video window', () => {
    const baseOptions = {
      shouldUseVideoPlayback: true,
      videoSyncOffsetSeconds: 5,
      importedVideoDuration: 4,
    }

    expect(resolvePlaybackSource({ ...baseOptions, playheadSecond: 4.99 })).toBe('timeline')
    expect(resolvePlaybackSource({ ...baseOptions, playheadSecond: 5 })).toBe('video')
    expect(resolvePlaybackSource({ ...baseOptions, playheadSecond: 8.99 })).toBe('video')
    expect(resolvePlaybackSource({ ...baseOptions, playheadSecond: 9 })).toBe('timeline')
  })
})

describe('pointerToSecond', () => {
  const totalDuration = 100

  test('clamps below zero to 0', () => {
    const axisRect = { left: 0 }
    expect(pointerToSecond(-50, axisRect, 0, 100, 500, totalDuration)).toBe(0)
  })

  test('clamps above totalDuration', () => {
    const axisRect = { left: 0 }
    expect(pointerToSecond(999, axisRect, 0, 100, 500, totalDuration)).toBe(totalDuration)
  })

  test('maps a mid-axis click to the correct second', () => {
    const axisRect = { left: 0 }
    expect(pointerToSecond(250, axisRect, 0, 100, 500, totalDuration)).toBe(50)
  })

  test('uses the axis rect width when available so pointer math matches the clicked element', () => {
    const axisRect = { left: 100, width: 400 }
    expect(pointerToSecond(300, axisRect, 0, 100, 500, totalDuration)).toBe(50)
  })

  test('works when viewport is zoomed in', () => {
    const axisRect = { left: 0 }
    expect(pointerToSecond(0, axisRect, 20, 40, 500, totalDuration)).toBe(20)
    expect(pointerToSecond(500, axisRect, 20, 40, 500, totalDuration)).toBe(40)
    expect(pointerToSecond(250, axisRect, 20, 40, 500, totalDuration)).toBe(30)
  })
})

describe('secondsToViewPx', () => {
  test('maps the viewport start to 0px', () => {
    expect(secondsToViewPx(0, 0, 100, 500)).toBe(0)
  })

  test('maps the viewport end to widthPx', () => {
    expect(secondsToViewPx(100, 0, 100, 500)).toBe(500)
  })

  test('maps a mid-second to the midpoint', () => {
    expect(secondsToViewPx(50, 0, 100, 500)).toBe(250)
  })

  test('returns 0 when span is zero', () => {
    expect(secondsToViewPx(5, 10, 10, 500)).toBe(0)
  })

  test('returns 0 when widthPx is zero', () => {
    expect(secondsToViewPx(5, 0, 100, 0)).toBe(0)
  })
})

describe('clampToView', () => {
  test('keeps a valid viewport unchanged', () => {
    expect(clampToView(0, 100, 200)).toEqual({ viewStart: 0, viewEnd: 100 })
  })

  test('shifts viewport left when it overshoots totalDuration', () => {
    expect(clampToView(150, 250, 200)).toEqual({ viewStart: 100, viewEnd: 200 })
  })

  test('shifts viewport right when start is negative', () => {
    expect(clampToView(-10, 90, 200)).toEqual({ viewStart: 0, viewEnd: 100 })
  })

  test('preserves span when clamping', () => {
    const result = clampToView(180, 230, 200)
    expect(result.viewEnd - result.viewStart).toBe(50)
  })

  test('clamps span to totalDuration when it exceeds', () => {
    expect(clampToView(0, 100, 0)).toEqual({ viewStart: 0, viewEnd: 0 })
  })
})

describe('fitToFull', () => {
  test('returns [0, totalDuration]', () => {
    expect(fitToFull(200)).toEqual({ viewStart: 0, viewEnd: 200 })
  })

  test('returns [0, 0] for zero duration', () => {
    expect(fitToFull(0)).toEqual({ viewStart: 0, viewEnd: 0 })
  })

  test('handles fractional duration', () => {
    expect(fitToFull(2.509)).toEqual({ viewStart: 0, viewEnd: 2.509 })
  })
})

describe('computeTimelineTicks', () => {
  test('picks a major step whose pixel spacing is at least 90px', () => {
    const ticks = computeTimelineTicks({ viewStart: 0, viewEnd: 100, widthPx: 900 })
    const majorStep = ticks.major[1].second - ticks.major[0].second
    const pxPerSecond = 900 / 100
    expect(majorStep * pxPerSecond).toBeGreaterThanOrEqual(90)
  })

  test('grid is anchored to the step boundary (first major % step === 0)', () => {
    const ticks = computeTimelineTicks({ viewStart: 15, viewEnd: 45, widthPx: 900 })
    const firstMajor = ticks.major[0].second
    const majorStep = ticks.major[1].second - ticks.major[0].second
    expect(firstMajor).toBeGreaterThanOrEqual(15)
    expect(firstMajor % majorStep).toBeCloseTo(0)
  })

  test('major ticks have labels, minor ticks do not', () => {
    const ticks = computeTimelineTicks({ viewStart: 0, viewEnd: 100, widthPx: 900 })
    for (const t of ticks.major) {
      expect(typeof t.label).toBe('string')
      expect(t.label.length).toBeGreaterThan(0)
    }
    for (const t of ticks.minor) {
      expect(t.label).toBeUndefined()
    }
  })

  test('uses intermediate five-minute candidates before jumping from 10m to 30m', () => {
    const ticks = computeTimelineTicks({ viewStart: 0, viewEnd: 7200, widthPx: 1000 })
    const majorStep = ticks.major[1].second - ticks.major[0].second
    expect(majorStep).toBe(900)
  })

  test('labels use one-decimal format below 1s step', () => {
    const ticks = computeTimelineTicks({ viewStart: 0, viewEnd: 2, widthPx: 900 })
    const labels = ticks.major.map((t) => t.label)
    expect(labels.some((l) => l.includes('.'))).toBe(true)
  })

  test('minor count is 5 per major step', () => {
    const ticks = computeTimelineTicks({ viewStart: 0, viewEnd: 60, widthPx: 900 })
    const majorStep = ticks.major[1].second - ticks.major[0].second
    const minorStep = ticks.minor[1].second - ticks.minor[0].second
    expect(majorStep / minorStep).toBeCloseTo(5)
  })
})

describe('zoomRange', () => {
  test('zoom in shrinks span by 1.6x pivoting around the playhead', () => {
    const result = zoomRange({ viewStart: 0, viewEnd: 100, pivot: 50, direction: 1, totalDuration: 200 })
    const newSpan = result.viewEnd - result.viewStart
    expect(newSpan).toBeCloseTo(100 / 1.6)
    expect(result.viewStart).toBeLessThanOrEqual(50)
    expect(result.viewEnd).toBeGreaterThanOrEqual(50)
  })

  test('zoom out grows span by 1.6x pivoting around the playhead', () => {
    const result = zoomRange({ viewStart: 20, viewEnd: 60, pivot: 40, direction: -1, totalDuration: 200 })
    const newSpan = result.viewEnd - result.viewStart
    expect(newSpan).toBeCloseTo(40 * 1.6)
  })

  test('zoom in clamps pivot into the current view', () => {
    const result = zoomRange({ viewStart: 20, viewEnd: 40, pivot: 100, direction: 1, totalDuration: 200 })
    const newSpan = result.viewEnd - result.viewStart
    expect(newSpan).toBeCloseTo(20 / 1.6)
    expect(result.viewEnd).toBeLessThanOrEqual(40)
  })

  test('enforces minimum visible span of 0.5s', () => {
    const result = zoomRange({ viewStart: 0, viewEnd: 1, pivot: 0.5, direction: 1, totalDuration: 10 })
    const newSpan = result.viewEnd - result.viewStart
    expect(newSpan).toBeGreaterThanOrEqual(0.5)
  })

  test('enforces maximum visible span of totalDuration', () => {
    const result = zoomRange({ viewStart: 40, viewEnd: 60, pivot: 50, direction: -1, totalDuration: 50 })
    const newSpan = result.viewEnd - result.viewStart
    expect(newSpan).toBeLessThanOrEqual(50)
  })

  test('clamps result to [0, totalDuration]', () => {
    const result = zoomRange({ viewStart: 0, viewEnd: 10, pivot: 5, direction: -1, totalDuration: 100 })
    expect(result.viewStart).toBeGreaterThanOrEqual(0)
    expect(result.viewEnd).toBeLessThanOrEqual(100)
  })

  test('pivot at viewport start zooms in keeping start anchored', () => {
    const result = zoomRange({ viewStart: 0, viewEnd: 100, pivot: 0, direction: 1, totalDuration: 200 })
    expect(result.viewStart).toBe(0)
    const newSpan = result.viewEnd - result.viewStart
    expect(newSpan).toBeCloseTo(100 / 1.6)
  })

  test('pivot at viewport end zooms in keeping end anchored', () => {
    const result = zoomRange({ viewStart: 0, viewEnd: 100, pivot: 100, direction: 1, totalDuration: 200 })
    expect(result.viewEnd).toBe(100)
    const newSpan = result.viewEnd - result.viewStart
    expect(newSpan).toBeCloseTo(100 / 1.6)
  })
})

describe('fitRangeToViewport', () => {
  test('adds 4% padding on each side of the target range', () => {
    const result = fitRangeToViewport({ rangeStart: 10, rangeEnd: 90, totalDuration: 100 })
    const span = result.viewEnd - result.viewStart
    const expectedRawSpan = 80
    const expectedPaddedSpan = expectedRawSpan * 1.08
    expect(result.viewStart).toBeCloseTo(6.8)
    expect(result.viewEnd).toBeCloseTo(93.2)
    expect(span).toBeCloseTo(expectedPaddedSpan)
  })

  test('clamps to [0, totalDuration] when padding extends beyond bounds', () => {
    const result = fitRangeToViewport({ rangeStart: 0, rangeEnd: 10, totalDuration: 100 })
    expect(result.viewStart).toBe(0)
    const span = result.viewEnd - result.viewStart
    expect(span).toBeGreaterThanOrEqual(10)
  })

  test('enforces 2s minimum visible span when totalDuration allows', () => {
    const result = fitRangeToViewport({ rangeStart: 5, rangeEnd: 5.5, totalDuration: 100 })
    const span = result.viewEnd - result.viewStart
    expect(span).toBeGreaterThanOrEqual(2)
  })

  test('does not enforce 2s minimum when totalDuration is too small', () => {
    const result = fitRangeToViewport({ rangeStart: 0, rangeEnd: 0.5, totalDuration: 1 })
    expect(result.viewEnd - result.viewStart).toBeLessThanOrEqual(1)
  })

  test('All target fits to [0, totalDuration]', () => {
    const result = fitRangeToViewport({ rangeStart: 0, rangeEnd: 100, totalDuration: 100 })
    expect(result.viewStart).toBe(0)
    expect(result.viewEnd).toBe(100)
  })

  test('Video target fits to [videoSyncOffsetSeconds, videoSyncOffsetSeconds + importedVideoDuration]', () => {
    const result = fitRangeToViewport({ rangeStart: 5, rangeEnd: 25, totalDuration: 60 })
    expect(result.viewStart).toBeCloseTo(4.2)
    expect(result.viewEnd).toBeCloseTo(25.8)
  })

  test('Activity target fits to [0, activitySummary.durationSeconds]', () => {
    const result = fitRangeToViewport({ rangeStart: 0, rangeEnd: 45, totalDuration: 60 })
    expect(result.viewStart).toBe(0)
    expect(result.viewEnd).toBeCloseTo(48.6)
  })

  test('handles zero-length range by clamping to minimum span', () => {
    const result = fitRangeToViewport({ rangeStart: 50, rangeEnd: 50, totalDuration: 100 })
    const span = result.viewEnd - result.viewStart
    expect(span).toBeGreaterThanOrEqual(2)
  })
})
