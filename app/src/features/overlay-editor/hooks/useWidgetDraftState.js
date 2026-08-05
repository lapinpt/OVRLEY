/**
 * Live widget draft state - temporary edits during drag/resize/scale/rotate.
 *
 * Maintains mutable refs for synchronous access during interaction callbacks
 * and a subscribable snapshot for rendering. Each draft contains the live data
 * patch shown by editors and, when a Moveable interaction is active, the live
 * DOM layout used by the canvas. Drafts are committed to config only when the
 * interaction ends.
 */

import { useState, useSyncExternalStore } from 'react'
import { clearLiveWidgetDraft, clearLiveWidgetDrafts } from '../utils/widgetDomHelpers'

function createWidgetLiveEdits() {
  const draftWidgetsRef = { current: {} }
  const widgetNodesRef = { current: {} }
  const activeWidgetInteractionRef = { current: null }
  const listeners = new Set()
  let snapshot = {
    liveWidgetDrafts: {},
    activeWidgetInteraction: null,
  }

  const notify = () => {
    listeners.forEach((listener) => listener())
  }

  const updateSnapshot = (nextSnapshot) => {
    snapshot = nextSnapshot
    notify()
  }

  return {
    beginWidgetInteraction(widgetId, type) {
      draftWidgetsRef.current[widgetId] = {
        data: {},
        layout: null,
      }
      activeWidgetInteractionRef.current = { widgetId, type }
    },
    clearWidgetDraft(widgetId) {
      clearLiveWidgetDraft(draftWidgetsRef, widgetId)
      if (!Object.hasOwn(snapshot.liveWidgetDrafts, widgetId)) return

      const liveWidgetDrafts = { ...snapshot.liveWidgetDrafts }
      delete liveWidgetDrafts[widgetId]
      updateSnapshot({
        ...snapshot,
        activeWidgetInteraction: activeWidgetInteractionRef.current?.widgetId === widgetId ? null : activeWidgetInteractionRef.current,
        liveWidgetDrafts,
      })
    },
    clearWidgetDrafts(widgetIds) {
      clearLiveWidgetDrafts(draftWidgetsRef, widgetIds)
      const liveWidgetDrafts = { ...snapshot.liveWidgetDrafts }
      let changed = false

      widgetIds.forEach((widgetId) => {
        if (!Object.hasOwn(liveWidgetDrafts, widgetId)) return
        delete liveWidgetDrafts[widgetId]
        changed = true
      })

      if (changed) {
        const activeWidgetInteraction = widgetIds.includes(activeWidgetInteractionRef.current?.widgetId) ? null : activeWidgetInteractionRef.current
        updateSnapshot({ ...snapshot, activeWidgetInteraction, liveWidgetDrafts })
      }
    },
    draftWidgetsRef,
    getSnapshot() {
      return snapshot
    },
    getWidgetNode(widgetId) {
      return widgetNodesRef.current[widgetId] ?? null
    },
    resetWidgetDrafts() {
      draftWidgetsRef.current = {}
      activeWidgetInteractionRef.current = null
      updateSnapshot({ ...snapshot, activeWidgetInteraction: null, liveWidgetDrafts: {} })
    },
    setLiveWidgetDraft(widgetId, nextData, nextLayout) {
      const currentDraft = draftWidgetsRef.current[widgetId] || { data: {}, layout: null }
      const nextDraft = {
        data: {
          ...currentDraft.data,
          ...nextData,
        },
        layout: nextLayout === undefined ? currentDraft.layout : nextLayout,
      }
      draftWidgetsRef.current[widgetId] = nextDraft
      updateSnapshot({
        ...snapshot,
        activeWidgetInteraction: activeWidgetInteractionRef.current,
        liveWidgetDrafts: {
          ...snapshot.liveWidgetDrafts,
          [widgetId]: nextDraft,
        },
      })
    },
    setLiveWidgetDraftsBatch(nextDraftsById) {
      const liveWidgetDrafts = { ...snapshot.liveWidgetDrafts }
      Object.entries(nextDraftsById).forEach(([widgetId, { data, layout }]) => {
        const currentDraft = draftWidgetsRef.current[widgetId] || { data: {}, layout: null }
        const nextDraft = {
          data: {
            ...currentDraft.data,
            ...data,
          },
          layout: layout === undefined ? currentDraft.layout : layout,
        }
        draftWidgetsRef.current[widgetId] = nextDraft
        liveWidgetDrafts[widgetId] = nextDraft
      })

      updateSnapshot({
        ...snapshot,
        activeWidgetInteraction: activeWidgetInteractionRef.current,
        liveWidgetDrafts,
      })
    },
    endWidgetInteraction(widgetId) {
      if (activeWidgetInteractionRef.current?.widgetId !== widgetId) return
      activeWidgetInteractionRef.current = null
      updateSnapshot({ ...snapshot, activeWidgetInteraction: null })
    },
    setWidgetNode(widgetId, node) {
      if (node && widgetNodesRef.current[widgetId] === node) return
      if (!node && !widgetNodesRef.current[widgetId]) return

      if (node) widgetNodesRef.current[widgetId] = node
      else delete widgetNodesRef.current[widgetId]
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export default function useWidgetDraftState() {
  const [controller] = useState(createWidgetLiveEdits)
  return controller
}

/**
 * Subscribes a component to a shared live-edit controller.
 *
 * @param {object} controller - Shared live-edit controller.
 * @returns {object} Controller methods and current render snapshot.
 */
export function useWidgetDraftView(controller) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  return { ...controller, ...snapshot }
}
