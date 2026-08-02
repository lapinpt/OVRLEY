/**
 * Rotate handler group for OverlayMoveable.
 */

import { applyLiveWidgetStyles } from '../utils/widgetDomHelpers'
import { buildFrameGeometryUpdate } from '@/lib/widget/widget-resolver'
import { buildRotateInteractionLayout, captureWidgetLayout, getWidgetInteractionPosition } from '../utils/widgetInteractionGeometry'

/**
 * Creates rotate-related moveable handlers.
 *
 * @param {object} ctx - Shared handler context.
 * @param {object} ctx.interactionStartRef
 * @param {object} ctx.draftWidgetsRef
 * @param {object} ctx.selectedWidget
 * @param {number} ctx.globalScale
 * @param {Function} ctx.setLiveWidgetDraft
 * @param {Function} ctx.commitWidgetUpdate
 * @param {Function} ctx.clearWidgetDraft
 * @param {Function} ctx.beginWidgetInteraction
 * @param {Function} ctx.endWidgetInteraction
 * @returns {object} Rotate handler methods.
 */
export function useRotateHandlers({
  interactionStartRef,
  draftWidgetsRef,
  selectedWidget,
  globalScale,
  setLiveWidgetDraft,
  commitWidgetUpdate,
  clearWidgetDraft,
  beginWidgetInteraction,
  endWidgetInteraction,
}) {
  // Rotate handlers — captures origin rotation, applies rotation + position offset, normalizes on end
  return {
    onRotateStart: ({ target }) => {
      if (!selectedWidget) return

      const layout = captureWidgetLayout(target, selectedWidget, globalScale)
      const position = getWidgetInteractionPosition(selectedWidget, layout)
      interactionStartRef.current = {
        id: selectedWidget.id,
        x: position.x,
        y: position.y,
        rotation: selectedWidget.data.rotation ?? 0,
        layout,
        type: 'rotate',
      }
      beginWidgetInteraction(selectedWidget.id, 'rotate')
    },
    onRotate: ({ beforeRotate, drag, target }) => {
      const origin = interactionStartRef.current
      if (!origin?.id) return

      const nextX = origin.x + (drag?.beforeTranslate?.[0] ?? 0)
      const nextY = origin.y + (drag?.beforeTranslate?.[1] ?? 0)
      const nextRotation = beforeRotate
      const nextDraft = {
        ...(draftWidgetsRef.current[origin.id]?.data ?? {}),
        x: nextX,
        y: nextY,
        rotation: nextRotation,
      }
      const layout = buildRotateInteractionLayout(origin.layout, drag?.beforeTranslate?.[0] ?? 0, drag?.beforeTranslate?.[1] ?? 0, nextRotation)

      setLiveWidgetDraft(origin.id, nextDraft, layout)
      applyLiveWidgetStyles(target, layout, globalScale)
    },
    onRotateEnd: () => {
      const origin = interactionStartRef.current
      if (!origin?.id) return

      const draft = draftWidgetsRef.current[origin.id]?.data
      if (draft) {
        const normalizedRotation = (((draft.rotation ?? origin.rotation ?? 0) % 360) + 360) % 360
        const geometryPatch = {
          x: Math.round(draft.x ?? origin.x),
          y: Math.round(draft.y ?? origin.y),
          rotation: Number(normalizedRotation.toFixed(1)),
        }
        commitWidgetUpdate(origin.id, buildFrameGeometryUpdate(selectedWidget?.data, geometryPatch))
      }

      clearWidgetDraft(origin.id)
      endWidgetInteraction(origin.id)
      interactionStartRef.current = null
    },
  }
}
