import { detectCodecs } from '@/api/backend'
import { createCachedPromise } from '@/lib/cached-promise'

let fetchCodecsOnce = null

function displayResolutionForImportedVideo(metadata) {
  const resolution = metadata?.resolution
  if (!resolution) {
    throw new Error('Imported video metadata must include a resolution')
  }

  const width = Number(resolution.width)
  const height = Number(resolution.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Imported video metadata contains an invalid resolution')
  }

  const rotation = metadata.rotationDegrees === null || metadata.rotationDegrees === undefined ? 0 : Number(metadata.rotationDegrees)
  if (!Number.isFinite(rotation)) {
    throw new Error('Imported video metadata contains an invalid rotation')
  }

  const normalizedRotation = ((rotation % 360) + 360) % 360
  if (![0, 90, 180, 270].includes(normalizedRotation)) {
    throw new Error('Imported video metadata contains an unsupported rotation')
  }

  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return { width: height, height: width }
  }

  return { width, height }
}

function validateImportedVideoTiming(metadata) {
  if (typeof metadata.path !== 'string' || metadata.path.length === 0) {
    throw new Error('Imported video metadata must include a path')
  }
  if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
    throw new Error('Imported video metadata contains an invalid duration')
  }
  if (!Number.isFinite(metadata.fps) || metadata.fps <= 0) {
    throw new Error('Imported video metadata contains an invalid frame rate')
  }
}

export const createVideoImportSlice = (set, get) => ({
  importedVideoPath: null, // absolute path from Tauri file dialog
  importedVideoDuration: null, // seconds (float), read via ffprobe
  importedVideoFps: null, // fps (float)
  importedVideoFpsNum: null, // exact ffprobe FPS numerator
  importedVideoFpsDen: null, // exact ffprobe FPS denominator
  importedVideoResolution: null, // display-oriented { width, height }
  importedVideoCreationTime: null, // ISO-8601 string or null
  importedVideoImportId: null, // opaque local preview server import ID
  importedVideoPreviewUrl: null, // local HTTP preview URL for the video element
  importedVideoPreviewWarnings: [],
  importedBackgroundImagePath: null, // absolute path from Tauri file dialog
  videoSyncOffsetSeconds: 0, // user-adjustable sync offset
  videoSyncWarning: null, // string warning or null
  availableCodecs: null,
  importedVideoCodecName: null,
  importedVideoCodecLongName: null,
  importedVideoBitRate: null,
  importedVideoCameraType: null,
  importedVideoCameraModel: null,

  setImportedVideo: (metadata) => {
    validateImportedVideoTiming(metadata)
    const importedVideoResolution = displayResolutionForImportedVideo(metadata)

    set({
      importedVideoPath: metadata.path,
      importedVideoDuration: metadata.duration,
      importedVideoFps: metadata.fps,
      importedVideoFpsNum: metadata.fpsNum,
      importedVideoFpsDen: metadata.fpsDen,
      importedVideoResolution,
      importedVideoCreationTime: metadata.creationTime,
      importedVideoImportId: metadata.importId ?? null,
      importedVideoPreviewUrl: metadata.previewUrl ?? null,
      importedVideoPreviewWarnings: metadata.previewWarnings ?? [],
      importedBackgroundImagePath: null,
      importedVideoCodecName: metadata.codecName ?? null,
      importedVideoCodecLongName: metadata.codecLongName ?? null,
      importedVideoBitRate: metadata.bitRate ?? null,
      importedVideoCameraType: metadata.cameraType ?? null,
      importedVideoCameraModel: metadata.cameraModel ?? null,
    })

    get().syncVideoMetadata()

    return importedVideoResolution
  },

  setImportedBackgroundImage: (path) =>
    set({
      importedVideoPath: null,
      importedVideoDuration: null,
      importedVideoFps: null,
      importedVideoFpsNum: null,
      importedVideoFpsDen: null,
      importedVideoResolution: null,
      importedVideoCreationTime: null,
      importedVideoImportId: null,
      importedVideoPreviewUrl: null,
      importedVideoPreviewWarnings: [],
      importedBackgroundImagePath: path || null,
      videoSyncOffsetSeconds: 0,
      videoSyncWarning: null,
      importedVideoCodecName: null,
      importedVideoCodecLongName: null,
      importedVideoBitRate: null,
      importedVideoCameraType: null,
      importedVideoCameraModel: null,
    }),

  clearImportedVideo: () => {
    get().clearVideoTelemetry()
    set({
      importedVideoPath: null,
      importedVideoDuration: null,
      importedVideoFps: null,
      importedVideoFpsNum: null,
      importedVideoFpsDen: null,
      importedVideoResolution: null,
      importedVideoCreationTime: null,
      importedVideoImportId: null,
      importedVideoPreviewUrl: null,
      importedVideoPreviewWarnings: [],
      importedBackgroundImagePath: null,
      videoSyncOffsetSeconds: 0,
      videoSyncWarning: null,
      importedVideoCodecName: null,
      importedVideoCodecLongName: null,
      importedVideoBitRate: null,
      importedVideoCameraType: null,
      importedVideoCameraModel: null,
    })
  },

  setVideoSyncOffset: (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error('Video sync offset must be a non-negative number')
    }
    set({
      videoSyncOffsetSeconds: seconds,
    })
  },

  setVideoSyncWarning: (msg) =>
    set({
      videoSyncWarning: msg,
    }),

  setImportedVideoPreviewWarnings: (warnings) =>
    set({
      importedVideoPreviewWarnings: Array.isArray(warnings) ? warnings : [],
    }),

  fetchAvailableCodecs: async () => {
    const cachedCodecs = get().availableCodecs
    if (cachedCodecs) {
      return cachedCodecs
    }

    if (!fetchCodecsOnce) {
      fetchCodecsOnce = createCachedPromise(detectCodecs)
    }

    try {
      const availableCodecs = await fetchCodecsOnce()
      set({ availableCodecs })
      return availableCodecs
    } catch (error) {
      console.error('Failed to detect ffmpeg codecs:', error)
      set({ availableCodecs: null })
      return null
    }
  },

  computeVideoSync: (activitySummary) =>
    set((state) => {
      if (!state.importedVideoCreationTime) {
        return {
          videoSyncOffsetSeconds: 0,
          videoSyncWarning: 'Could not determine video creation time',
        }
      }

      const videoStart = new Date(state.importedVideoCreationTime).getTime()
      const activityStart = new Date(activitySummary?.syncTime).getTime()
      const activityEnd = new Date(activitySummary?.endTime).getTime()

      if (isNaN(videoStart) || (activitySummary && (isNaN(activityStart) || isNaN(activityEnd)))) {
        return {
          videoSyncOffsetSeconds: 0,
          videoSyncWarning: 'Invalid timestamp formats',
        }
      }

      const offsetSeconds = (videoStart - activityStart) / 1000

      // within [activityStart, activityEnd]
      if (videoStart < activityStart || videoStart > activityEnd) {
        return {
          videoSyncOffsetSeconds: 0,
          videoSyncWarning: 'Video could not be synced with activity',
        }
      }

      return {
        videoSyncOffsetSeconds: offsetSeconds,
        videoSyncWarning: null,
      }
    }),
})
