/**
 * Manages metadata, error, and seek-latency warnings for the preview video.
 */

import { useEffect, useRef, useState } from 'react'
import {
  HEVC_FRAME_TIMEOUT_MS,
  METADATA_SOFT_WARNING_MS,
  METADATA_STRONG_WARNING_MS,
  SLOW_SEEK_WARNING_COUNT,
  SLOW_SEEK_WARNING_MS,
} from '../data/videoPreviewConstants'
import { describeMediaError } from '../utils/videoPreviewPlayback'

const HAVE_CURRENT_DATA = 2
const HEVC_PLAYBACK_WARNING =
  'The system preview player could not produce frames for this HEVC video. HEVC playback support may be missing, or this profile may not be supported by the system decoder.'

function isHevcCodec(codecName) {
  return codecName === 'hevc'
}

function isHevcDecoderError(error) {
  return error.code === MediaError.MEDIA_ERR_DECODE || error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
}

function clearMetadataTimers(metadataSoftTimerRef, metadataStrongTimerRef) {
  if (metadataSoftTimerRef.current !== null) {
    window.clearTimeout(metadataSoftTimerRef.current)
    metadataSoftTimerRef.current = null
  }

  if (metadataStrongTimerRef.current !== null) {
    window.clearTimeout(metadataStrongTimerRef.current)
    metadataStrongTimerRef.current = null
  }
}

function clearFrameWatchdog(frameWatchdogTimerRef) {
  if (frameWatchdogTimerRef.current !== null) {
    window.clearTimeout(frameWatchdogTimerRef.current)
    frameWatchdogTimerRef.current = null
  }
}

function clearFrameCallback(video, frameCallbackIdRef) {
  if (frameCallbackIdRef.current === null) {
    return
  }

  if (typeof video.cancelVideoFrameCallback === 'function') {
    video.cancelVideoFrameCallback(frameCallbackIdRef.current)
  }
  frameCallbackIdRef.current = null
}

/**
 * Tracks user-visible warning state for the active preview video.
 *
 * @param {object} options - Warning inputs.
 * @param {string|null} options.codecName - FFprobe codec name for the imported video stream.
 * @param {boolean} options.isActive - Whether the video element is currently rendered.
 * @param {React.RefObject<HTMLVideoElement>} options.videoRef - Preview video ref.
 * @param {string} options.videoSrc - Active preview video source URL.
 * @returns {{ hevcPlaybackWarning: string, metadataStatusMessage: string, nativeVideoError: string, seekWarning: string }} Warning state.
 */
export function useVideoPreviewWarnings({ codecName, isActive, videoRef, videoSrc }) {
  const [hevcPlaybackWarning, setHevcPlaybackWarning] = useState('')
  const [metadataStatusMessage, setMetadataStatusMessage] = useState('')
  const [nativeVideoError, setNativeVideoError] = useState('')
  const [seekWarning, setSeekWarning] = useState('')

  const frameCallbackIdRef = useRef(null)
  const frameWatchdogTimerRef = useRef(null)
  const metadataSoftTimerRef = useRef(null)
  const metadataStrongTimerRef = useRef(null)
  const seekStartedAtMsRef = useRef(null)
  const slowSeekCountRef = useRef(0)

  useEffect(() => {
    clearFrameWatchdog(frameWatchdogTimerRef)
    clearMetadataTimers(metadataSoftTimerRef, metadataStrongTimerRef)
    setHevcPlaybackWarning('')
    setMetadataStatusMessage('')
    setNativeVideoError('')
    setSeekWarning('')
    slowSeekCountRef.current = 0
    seekStartedAtMsRef.current = null

    if (!isActive || !videoSrc) {
      return undefined
    }

    metadataSoftTimerRef.current = window.setTimeout(() => {
      setMetadataStatusMessage('Loading video metadata...')
    }, METADATA_SOFT_WARNING_MS)

    metadataStrongTimerRef.current = window.setTimeout(() => {
      setMetadataStatusMessage('This file is taking unusually long to load. It may be on a slow drive or use metadata stored at the end of the file.')
    }, METADATA_STRONG_WARNING_MS)

    return () => clearMetadataTimers(metadataSoftTimerRef, metadataStrongTimerRef)
  }, [codecName, isActive, videoSrc])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !isActive || !videoSrc) {
      return undefined
    }

    const checksHevcFrames = isHevcCodec(codecName)
    const supportsVideoFrameCallback = typeof video.requestVideoFrameCallback === 'function'
    let framePresented = false

    const handlePresentedFrame = () => {
      framePresented = true
      frameCallbackIdRef.current = null
      clearFrameWatchdog(frameWatchdogTimerRef)
      setHevcPlaybackWarning('')
    }

    const startFrameWatchdog = () => {
      if (!checksHevcFrames || frameWatchdogTimerRef.current !== null) {
        return
      }

      frameWatchdogTimerRef.current = window.setTimeout(() => {
        frameWatchdogTimerRef.current = null
        if (framePresented || video.error) {
          return
        }

        const hasLoadedMediaData = video.readyState >= HAVE_CURRENT_DATA || video.buffered.length > 0
        if (!hasLoadedMediaData) {
          setMetadataStatusMessage('Video metadata loaded, but preview data could not be read from the local video source.')
          return
        }

        setHevcPlaybackWarning(HEVC_PLAYBACK_WARNING)
      }, HEVC_FRAME_TIMEOUT_MS)
    }

    if (checksHevcFrames && supportsVideoFrameCallback) {
      frameCallbackIdRef.current = video.requestVideoFrameCallback(handlePresentedFrame)
    }

    const handleLoadedMetadata = () => {
      clearMetadataTimers(metadataSoftTimerRef, metadataStrongTimerRef)
      setMetadataStatusMessage('')
      startFrameWatchdog()
    }

    const handleLoadedData = () => {
      if (checksHevcFrames && !supportsVideoFrameCallback && video.videoWidth > 0 && video.videoHeight > 0) {
        handlePresentedFrame()
      }
    }

    const handleVideoError = () => {
      clearFrameWatchdog(frameWatchdogTimerRef)
      clearFrameCallback(video, frameCallbackIdRef)

      if (checksHevcFrames && isHevcDecoderError(video.error)) {
        setHevcPlaybackWarning(HEVC_PLAYBACK_WARNING)
        setNativeVideoError('')
        return
      }

      const message = describeMediaError(video.error)
      setNativeVideoError(message)
    }

    const handleSeeking = () => {
      seekStartedAtMsRef.current = performance.now()
    }

    const handleSeeked = () => {
      const startedAt = seekStartedAtMsRef.current
      seekStartedAtMsRef.current = null

      if (startedAt === null) {
        return
      }

      const latencyMs = performance.now() - startedAt

      if (latencyMs >= SLOW_SEEK_WARNING_MS) {
        slowSeekCountRef.current += 1
      } else {
        slowSeekCountRef.current = Math.max(0, slowSeekCountRef.current - 1)
      }

      if (slowSeekCountRef.current >= SLOW_SEEK_WARNING_COUNT) {
        setSeekWarning('Seeking is slow for this file. A lower-resolution preview proxy may improve responsiveness.')
      }
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('loadeddata', handleLoadedData)
    video.addEventListener('error', handleVideoError)
    video.addEventListener('seeking', handleSeeking)
    video.addEventListener('seeked', handleSeeked)

    if (video.error) {
      handleVideoError()
    } else if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      handleLoadedMetadata()
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('error', handleVideoError)
      video.removeEventListener('seeking', handleSeeking)
      video.removeEventListener('seeked', handleSeeked)
      clearFrameWatchdog(frameWatchdogTimerRef)
      clearFrameCallback(video, frameCallbackIdRef)
    }
  }, [codecName, isActive, videoRef, videoSrc])

  return {
    hevcPlaybackWarning,
    metadataStatusMessage,
    nativeVideoError,
    seekWarning,
  }
}
