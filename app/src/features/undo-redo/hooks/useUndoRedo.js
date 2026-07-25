import { useCallback, useEffect } from 'react'
import { useStore as useZustandStore } from 'zustand'
import useStore from '@/store/useStore'
import { redoHistory, undoHistory } from '../undoHistory'

function isTextEditingElement(target) {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('input, textarea, [role="textbox"], [contenteditable="true"]'))
}

function getHistoryCommand(event) {
  if (!event.metaKey && !event.ctrlKey) return null

  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && event.ctrlKey && !event.metaKey && !event.shiftKey) return 'redo'
  return null
}

/**
 * Owns reactive undo/redo availability and global editor shortcuts.
 *
 * @param {object} options - Hook options.
 * @param {boolean} [options.disabled=false] - Whether history commands are temporarily unavailable.
 * @returns {{ canRedo: boolean, canUndo: boolean, redo: Function, undo: Function }} Undo/redo control model.
 */
export default function useUndoRedo({ disabled = false } = {}) {
  const hasPastStates = useZustandStore(useStore.temporal, (state) => state.pastStates.length > 0)
  const hasFutureStates = useZustandStore(useStore.temporal, (state) => state.futureStates.length > 0)

  const undo = useCallback(() => {
    if (disabled) return
    undoHistory(useStore)
  }, [disabled])

  const redo = useCallback(() => {
    if (disabled) return
    redoHistory(useStore)
  }, [disabled])

  useEffect(() => {
    if (disabled || typeof window === 'undefined') {
      return undefined
    }

    const handleKeyDown = (event) => {
      if (event.defaultPrevented || event.repeat || event.altKey || isTextEditingElement(event.target)) {
        return
      }

      const command = getHistoryCommand(event)

      if (command === 'undo' && hasPastStates) {
        event.preventDefault()
        undo()
      } else if (command === 'redo' && hasFutureStates) {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [disabled, hasFutureStates, hasPastStates, redo, undo])

  return {
    canRedo: !disabled && hasFutureStates,
    canUndo: !disabled && hasPastStates,
    redo,
    undo,
  }
}
