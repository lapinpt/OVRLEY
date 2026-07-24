import { Redo2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SimpleTooltip } from '@/components/ui/simple-tooltip'

/**
 * Renders editor undo and redo commands.
 *
 * @param {object} props - Component props.
 * @param {boolean} props.canRedo - Whether redo is available.
 * @param {boolean} props.canUndo - Whether undo is available.
 * @param {Function} props.onRedo - Redo command.
 * @param {Function} props.onUndo - Undo command.
 * @returns {JSX.Element} Rendered controls.
 */
export default function UndoRedoControls({ canRedo, canUndo, onRedo, onUndo }) {
  return (
    <div className="flex items-center gap-1">
      <SimpleTooltip side="bottom" content="Undo (Ctrl/Cmd+Z)">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={!canUndo} aria-label="Undo" onClick={onUndo}>
          <Undo2 className="h-4 w-4" />
        </Button>
      </SimpleTooltip>
      <SimpleTooltip side="bottom" content="Redo (Ctrl/Cmd+Shift+Z)">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={!canRedo} aria-label="Redo" onClick={onRedo}>
          <Redo2 className="h-4 w-4" />
        </Button>
      </SimpleTooltip>
    </div>
  )
}
