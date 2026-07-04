import { describe, expect, test } from 'vitest'
import {
  createPlaybackAnchor,
  formatTimelineTime,
  getTimelinePlaybackSecond,
  getTotalPlaybackDuration,
  resolvePlaybackSource,
} from '@/features/player/utils/playerTiming'

describe('playerTiming utilities', () => {
  test('formats timeline seconds as mm:ss or h:mm:ss labels', () => {
    expect(formatTimelineTime(65)).toBe('01:05')
    expect(formatTimelineTime(3661)).toBe('1:01:01')
  })

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
      importedVideoDuration: 4,
      shouldUseVideoPlayback: true,
      videoSyncOffsetSeconds: 5,
    }

    expect(resolvePlaybackSource({ ...baseOptions, playheadSecond: 4.99 })).toBe('timeline')
    expect(resolvePlaybackSource({ ...baseOptions, playheadSecond: 5 })).toBe('video')
    expect(resolvePlaybackSource({ ...baseOptions, playheadSecond: 8.99 })).toBe('video')
    expect(resolvePlaybackSource({ ...baseOptions, playheadSecond: 9 })).toBe('timeline')
  })

  test('creates timeline anchors and resolves elapsed playback seconds', () => {
    const anchor = createPlaybackAnchor({
      nowMs: 1000,
      second: 2,
      source: 'timeline',
    })

    expect(anchor).toEqual({ startedAtMs: 1000, startedSecond: 2 })
    expect(getTimelinePlaybackSecond({ anchor, nowMs: 1750 })).toBe(2.75)
    expect(createPlaybackAnchor({ nowMs: 1000, second: 4, source: 'video' })).toEqual({ startedAtMs: 0, startedSecond: 4 })
  })
})
