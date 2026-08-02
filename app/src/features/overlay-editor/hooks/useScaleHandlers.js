/**
 * Scale handler group for OverlayMoveable.
 */

import { getWidgetVisualBoundsFromTarget, updateLiveWidgetDraft } from '../utils/widgetDomHelpers'
import { buildScaleDraft } from '../utils/widgetResizeScaling'
import { buildScaleInteractionLayout, captureWidgetLayout } from '../utils/widgetInteractionGeometry'

/**
 * Creates scale-related moveable handlers.
 *
 * @param {object} ctx - Shared handler context.
 * @param {object} ctx.interactionStartRef
 * @param {object} ctx.draftWidgetsRef
 * @param {object} ctx.selectedWidget
 * @param {object} ctx.selectedTarget
 * @param {number} ctx.globalScale
 * @param {Function} ctx.beginWidgetInteraction
 * @param {Function} ctx.endWidgetInteraction
 * @param {Function} ctx.commitWidgetUpdate
 * @param {Function} ctx.clearWidgetDraft
 * @returns {object} Scale handler methods.
 */
export function useScaleHandlers({
  interactionStartRef,
  draftWidgetsRef,
  selectedWidget,
  selectedTarget,
  globalScale,
  setLiveWidgetDraft,
  commitWidgetUpdate,
  clearWidgetDraft,
  beginWidgetInteraction,
  endWidgetInteraction,
}) {
  // Scale handlers — uniform scaling of intrinsic widget data and layout.
  return {
    onScaleStart: ({ dragStart, target }) => {
      if (!selectedWidget) return

      if (dragStart) {
        dragStart.set([0, 0])
      }

      const currentBounds = getWidgetVisualBoundsFromTarget(target ?? selectedTarget)
      const startTarget = target ?? selectedTarget

      interactionStartRef.current = {
        id: selectedWidget.id,
        data: selectedWidget.data,
        x: selectedWidget.data.x ?? 0,
        y: selectedWidget.data.y ?? 0,
        layout: captureWidgetLayout(startTarget, selectedWidget, globalScale),
        renderedMinX: currentBounds?.minX ?? 0,
        renderedMinY: currentBounds?.minY ?? 0,
        renderedMaxX: currentBounds?.maxX ?? 0,
        renderedMaxY: currentBounds?.maxY ?? 0,
        type: 'scale',
      }
      beginWidgetInteraction(selectedWidget.id, 'scale')
    },
    onScale: ({ scale, drag, target }) => {
      const origin = interactionStartRef.current
      if (!origin?.id) return
      const rawScale = Number.isFinite(scale?.[0]) ? scale[0] : Number.isFinite(scale?.[1]) ? scale[1] : 1
      const safeGlobalScale = globalScale > 0 ? globalScale : 1
      const uniformScale = rawScale / safeGlobalScale

      const tx = drag?.beforeTranslate?.[0] ?? 0
      const ty = drag?.beforeTranslate?.[1] ?? 0

      const gradientYOffset = selectedWidget.type === 'gradient' ? Math.min(0, -origin.data.value_offset) : 0
      const nextX = origin.x + tx + origin.renderedMinX * (1 - uniformScale) * globalScale
      const nextY = origin.y + ty + (origin.renderedMinY * globalScale + gradientYOffset) * (1 - uniformScale)

      const scaledData = buildScaleDraft(origin.data, uniformScale, selectedWidget, { round: false })
      const liveLayout = buildScaleInteractionLayout(origin.layout, {
        scaleFactor: uniformScale,
        globalScale,
        translateX: tx,
        translateY: ty,
      })
      updateLiveWidgetDraft({
        draftWidgetsRef,
        setLiveWidgetDraft,
        widgetId: origin.id,
        widget: selectedWidget,
        updates: { ...scaledData, x: nextX, y: nextY },
        target: target ?? selectedTarget,
        globalScale,
        layout: liveLayout,
      })
    },
    onScaleEnd: () => {
      const origin = interactionStartRef.current
      if (!origin?.id) return

      const draft = draftWidgetsRef.current[origin.id]?.data
      if (draft) {
        const liveLayout = draftWidgetsRef.current[origin.id]?.layout
        const finalScale = liveLayout?.scaleFactor ?? 1
        const scaledDraft = buildScaleDraft(origin.data, finalScale, selectedWidget, { round: true })

        const tx = liveLayout?.translateX ?? 0
        const ty = liveLayout?.translateY ?? 0
        const gradientYOffset = selectedWidget.type === 'gradient' ? Math.min(0, -origin.data.value_offset) : 0
        const finalX = origin.x + tx + origin.renderedMinX * (1 - finalScale) * globalScale
        const finalY = origin.y + ty + (origin.renderedMinY * globalScale + gradientYOffset) * (1 - finalScale)

        commitWidgetUpdate(origin.id, {
          x: Math.round(finalX),
          y: Math.round(finalY),
          ...scaledDraft,
        })
      }

      clearWidgetDraft(origin.id)
      endWidgetInteraction(origin.id)
      interactionStartRef.current = null
    },
  }
}
