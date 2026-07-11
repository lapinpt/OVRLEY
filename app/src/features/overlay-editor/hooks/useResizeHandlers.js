/**
 * Resize handler group for OverlayMoveable.
 */

import { applyLiveWidgetStyles } from '../utils/widgetDomHelpers'
import { buildResizeContentDraft, buildResizeUpdate, captureResizeOrigin, getResizeScaleFactor } from '../utils/widgetResizeScaling'
import { clamp } from '@/lib/utils'
import { isBackdropWidget, isFramedWidget } from '@/lib/widget/display-type-behavior'
import { resolveActiveBackdropData, resolveActiveMetricWidgetData } from '@/lib/widget/widget-resolver'

/**
 * Creates resize-related moveable handlers.
 *
 * @param {object} ctx - Shared handler context.
 * @param {object} ctx.interactionStartRef
 * @param {object} ctx.draftWidgetsRef
 * @param {object} ctx.selectedWidget
 * @param {number} ctx.globalScale
 * @param {Function} ctx.setLiveWidgetDraft
 * @param {Function} ctx.commitWidgetUpdate
 * @param {Function} ctx.clearWidgetDraft
 * @returns {object} Resize handler methods.
 */
export function useResizeHandlers({
  interactionStartRef,
  draftWidgetsRef,
  selectedWidget,
  globalScale,
  setLiveWidgetDraft,
  commitWidgetUpdate,
  clearWidgetDraft,
}) {
  // Resize handlers — captures origin dimensions, computes scaled size, commits on end
  return {
    onResizeStart: ({ dragStart }) => {
      if (!selectedWidget) return

      if (dragStart) {
        dragStart.set([0, 0])
      }

      const frameData = isBackdropWidget(selectedWidget)
        ? resolveActiveBackdropData(selectedWidget.data)
        : resolveActiveMetricWidgetData(selectedWidget.data)
      const scaleOrigin = captureResizeOrigin(selectedWidget)
      interactionStartRef.current = {
        id: selectedWidget.id,
        widgetData: selectedWidget.data,
        x: selectedWidget.data.x ?? 0,
        y: selectedWidget.data.y ?? 0,
        width: frameData?.width ?? selectedWidget.data.width ?? 0,
        height: frameData?.height ?? selectedWidget.data.height ?? 0,
        markerSize: selectedWidget.data.marker_size ?? null,
        type: 'resize',
        ...(scaleOrigin || {}),
      }
      draftWidgetsRef.current[selectedWidget.id] = {}
    },
    onResize: ({ width, height, drag, target }) => {
      const origin = interactionStartRef.current
      if (!origin?.id) return

      const nextX = origin.x + drag.beforeTranslate[0]
      const nextY = origin.y + drag.beforeTranslate[1]
      const dimensionScale = isFramedWidget(selectedWidget) ? Math.max(Number(globalScale) || 1, 0.1) : 1
      const nextWidth = Math.max(width / dimensionScale, 8)
      const nextHeight = Math.max(height / dimensionScale, 8)
      const scaleFactor = getResizeScaleFactor(origin, nextWidth, nextHeight)
      const contentDraft = buildResizeContentDraft(selectedWidget, origin, scaleFactor)
      const widthScale = origin.width ? nextWidth / origin.width : 1
      const heightScale = origin.height ? nextHeight / origin.height : 1
      const markerScale = (widthScale + heightScale) / 2
      const nextMarkerSize = origin.markerSize === null ? undefined : clamp(Math.round(origin.markerSize * markerScale), 0, 400)

      const nextDraft = {
        ...draftWidgetsRef.current[origin.id],
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        ...contentDraft,
        ...(nextMarkerSize === undefined ? {} : { marker_size: nextMarkerSize }),
      }

      setLiveWidgetDraft(origin.id, nextDraft)
      if (isFramedWidget(selectedWidget)) {
        applyLiveWidgetStyles(target ?? drag.target, selectedWidget, nextDraft, globalScale)
      }
    },
    onResizeEnd: () => {
      const origin = interactionStartRef.current
      if (!origin?.id) return

      const draft = draftWidgetsRef.current[origin.id]
      if (draft) {
        const geometryPatch = {
          x: Math.round(draft.x ?? origin.x),
          y: Math.round(draft.y ?? origin.y),
          width: Math.max(Math.round(draft.width ?? 0), 0),
          height: Math.max(Math.round(draft.height ?? 0), 0),
          ...(draft.marker_size === undefined ? {} : { marker_size: Math.max(Math.round(draft.marker_size), 0) }),
        }
        const scaleFactor = getResizeScaleFactor(origin, geometryPatch.width, geometryPatch.height)
        const contentDraft = buildResizeContentDraft(selectedWidget, origin, scaleFactor, { round: true })
        commitWidgetUpdate(origin.id, buildResizeUpdate(origin.widgetData, geometryPatch, contentDraft))
      }

      clearWidgetDraft(origin.id)
      interactionStartRef.current = null
    },
  }
}
