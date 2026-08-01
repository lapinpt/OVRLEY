/**
 * Owns pointer gesture state for horizontal clip dragging on the timeline.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { videoOverlapsActivity } from '@/lib/video-timing'
import { pointerToSecond, snapClipOffset, viewPxToSeconds } from '../utils/timelineGeometry'

const AUTO_SCROLL_EDGE_RATIO = 0.15

function isPrimaryButton(event) {
  return event.button === undefined || event.button === 0
}

function getTimelineWidth(metrics) {
  const rectWidth = metrics.containerElement?.getBoundingClientRect?.().width
  return rectWidth > 0 ? rectWidth : metrics.widthPx
}

function getAutoScrollPointerSecond(metrics, clientX) {
  const rect = metrics.containerElement?.getBoundingClientRect?.()
  const widthPx = rect?.width > 0 ? rect.width : metrics.widthPx
  if (widthPx <= 0) return null
  const left = rect?.left ?? 0
  const right = left + widthPx
  const edgeWidth = widthPx * AUTO_SCROLL_EDGE_RATIO
  if (clientX >= left + edgeWidth && clientX <= right - edgeWidth) return null
  return pointerToSecond({
    clientX,
    rect: { left, width: widthPx },
    viewStart: metrics.viewStart,
    viewEnd: metrics.viewEnd,
    widthPx,
    timelineMinimum: metrics.timelineMinimum,
    totalDuration: metrics.totalDuration,
  })
}

/**
 * Owns horizontal drag gestures for activity and video clips.
 *
 * @param {object} options Drag command inputs.
 * @param {function} options.setVideoSyncOffset Store action for committing the sync offset.
 * @param {function} [options.setVideoSyncOffsetPreview=options.setVideoSyncOffset] Store action for updating the transient preview offset.
 * @returns {object} Per-lane drag props, dragging flag, and metrics sync command.
 */
export default function useClipDrag({ setVideoSyncOffset, setVideoSyncOffsetPreview = setVideoSyncOffset }) {
  const [isDragging, setIsDragging] = useState(false)
  const [snapGuidelineSecond, setSnapGuidelineSecond] = useState(null)

  const dragRef = useRef(null)
  const autoScrollFrameRef = useRef(null)
  const autoScrollTickRef = useRef(null)
  const offsetFrameRef = useRef(null)
  const pendingOffsetRef = useRef(null)

  const metricsRef = useRef({
    viewStart: 0,
    viewEnd: 0,
    widthPx: 0,
    timelineMinimum: 0,
    videoSyncOffsetSeconds: 0,
    activityDurationSeconds: 0,
    importedVideoDuration: 0,
  })

  const updateMetrics = useCallback((metrics) => {
    Object.assign(metricsRef.current, metrics)
  }, [])

  const cancelAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current === null) return
    window.cancelAnimationFrame?.(autoScrollFrameRef.current)
    autoScrollFrameRef.current = null
  }, [])

  const cancelPendingOffset = useCallback(() => {
    if (offsetFrameRef.current !== null) {
      window.cancelAnimationFrame?.(offsetFrameRef.current)
      offsetFrameRef.current = null
    }
    pendingOffsetRef.current = null
  }, [])

  const publishPreviewOffset = useCallback(
    (offset) => {
      pendingOffsetRef.current = offset
      if (offsetFrameRef.current !== null) return
      if (typeof window.requestAnimationFrame !== 'function') {
        pendingOffsetRef.current = null
        setVideoSyncOffsetPreview(offset)
        return
      }

      offsetFrameRef.current = window.requestAnimationFrame(() => {
        offsetFrameRef.current = null
        const nextOffset = pendingOffsetRef.current
        pendingOffsetRef.current = null
        if (nextOffset !== null) setVideoSyncOffsetPreview(nextOffset)
      })
    },
    [setVideoSyncOffsetPreview],
  )

  const updateDragOffset = useCallback(
    (clientX) => {
      const drag = dragRef.current
      if (drag?.type !== 'clip-drag') return

      const metrics = metricsRef.current
      const widthPx = getTimelineWidth(metrics)
      const deltaSeconds = viewPxToSeconds({
        deltaPx: clientX - drag.startClientX,
        viewStart: metrics.viewStart,
        viewEnd: metrics.viewEnd,
        widthPx,
      })
      const direction = drag.laneId === 'activity' ? -1 : 1
      const raw = drag.initialOffset + direction * deltaSeconds
      const snap = snapClipOffset({
        activityDuration: metrics.activityDurationSeconds,
        proposedOffset: raw,
        videoDuration: metrics.importedVideoDuration,
        viewEnd: metrics.viewEnd,
        viewStart: metrics.viewStart,
        widthPx,
      })
      const nextOffset = snap.offset
      if (!videoOverlapsActivity({ videoStart: nextOffset, videoDuration: metrics.importedVideoDuration })) return
      if (nextOffset === drag.currentOffset && snap.guidelineSecond === drag.guidelineSecond) return

      drag.currentOffset = nextOffset
      drag.guidelineSecond = snap.guidelineSecond
      setSnapGuidelineSecond(snap.guidelineSecond)
      publishPreviewOffset(nextOffset)
    },
    [publishPreviewOffset],
  )

  const autoScrollTick = useCallback(() => {
    autoScrollFrameRef.current = null
    const drag = dragRef.current
    if (drag?.type !== 'clip-drag') return

    const metrics = metricsRef.current
    const targetSecond = getAutoScrollPointerSecond(metrics, drag.pointerClientX)
    if (targetSecond === null) return

    const followResult = metrics.followSecond?.(targetSecond)
    if (!followResult) return

    const direction = drag.laneId === 'activity' ? -1 : 1
    drag.initialOffset += direction * followResult.deltaStart
    metrics.viewStart = followResult.viewport.viewStart
    metrics.viewEnd = followResult.viewport.viewEnd
    updateDragOffset(drag.pointerClientX)
    autoScrollFrameRef.current = window.requestAnimationFrame(() => autoScrollTickRef.current?.())
  }, [updateDragOffset])

  // A queued RAF must call the newest tick callback after dependencies change.
  useEffect(() => {
    autoScrollTickRef.current = autoScrollTick
  }, [autoScrollTick])

  const scheduleAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null || typeof window.requestAnimationFrame !== 'function') return
    autoScrollFrameRef.current = window.requestAnimationFrame(autoScrollTick)
  }, [autoScrollTick])

  const endDrag = useCallback(
    (event, commit) => {
      const drag = dragRef.current
      if (drag?.type !== 'clip-drag' || drag.pointerId !== event.pointerId) return
      event.stopPropagation()
      cancelAutoScroll()
      cancelPendingOffset()
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      dragRef.current = null
      setIsDragging(false)

      const metrics = metricsRef.current
      const snap = snapClipOffset({
        activityDuration: metrics.activityDurationSeconds,
        proposedOffset: drag.currentOffset,
        videoDuration: metrics.importedVideoDuration,
        viewEnd: metrics.viewEnd,
        viewStart: metrics.viewStart,
        widthPx: getTimelineWidth(metrics),
      })
      const requestedOffset = commit ? Math.round(snap.offset * 10) / 10 : drag.initialOffset
      const nextOffset = videoOverlapsActivity({ videoStart: requestedOffset, videoDuration: metrics.importedVideoDuration })
        ? requestedOffset
        : drag.currentOffset
      setSnapGuidelineSecond(null)
      setVideoSyncOffset(nextOffset)
      setVideoSyncOffsetPreview(null)
    },
    [cancelAutoScroll, cancelPendingOffset, setVideoSyncOffset, setVideoSyncOffsetPreview],
  )

  useEffect(
    () => () => {
      cancelAutoScroll()
      cancelPendingOffset()
      setVideoSyncOffsetPreview(null)
    },
    [cancelAutoScroll, cancelPendingOffset, setVideoSyncOffsetPreview],
  )

  const getLaneDragProps = useCallback(
    (laneId) => ({
      onPointerDown: (event) => {
        if (!isPrimaryButton(event)) return
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        cancelAutoScroll()
        cancelPendingOffset()
        setVideoSyncOffsetPreview(metricsRef.current.videoSyncOffsetSeconds)
        setSnapGuidelineSecond(null)
        dragRef.current = {
          type: 'clip-drag',
          laneId,
          initialOffset: metricsRef.current.videoSyncOffsetSeconds,
          currentOffset: metricsRef.current.videoSyncOffsetSeconds,
          pointerId: event.pointerId,
          pointerClientX: event.clientX,
          startClientX: event.clientX,
          guidelineSecond: null,
        }
        setIsDragging(true)
      },
      onPointerMove: (event) => {
        const drag = dragRef.current
        if (drag?.type !== 'clip-drag' || drag.pointerId !== event.pointerId) return
        event.stopPropagation()
        drag.pointerClientX = event.clientX
        updateDragOffset(event.clientX)
        scheduleAutoScroll()
      },
      onPointerUp: (event) => endDrag(event, true),
      onPointerCancel: (event) => endDrag(event, false),
    }),
    [cancelPendingOffset, cancelAutoScroll, endDrag, scheduleAutoScroll, setVideoSyncOffsetPreview, updateDragOffset],
  )

  return {
    getLaneDragProps,
    isDragging,
    snapGuidelineSecond,
    updateMetrics,
  }
}
