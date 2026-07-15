import { Pause, Play, Rewind, RotateCcw, StepBack, StepForward, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SimpleTooltip } from '@/components/ui/simple-tooltip'

/**
 * Presentational toolbar for zoom, fit target, transport, and time display controls.
 *
 * @param {{ toolbar: object }} props Toolbar view model.
 */
export default function PlayerToolbar({ toolbar }) {
  return (
    <div className="flex w-full items-center justify-between gap-4">
      <div className="flex items-center gap-1">
        <SimpleTooltip side="top" content="Zoom out">
          <Button type="button" aria-label="Zoom out" size="toolbar-icon" variant="toolbar" onClick={toolbar.zoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </SimpleTooltip>
        <SimpleTooltip side="top" content="Zoom in">
          <Button type="button" aria-label="Zoom in" size="toolbar-icon" variant="toolbar" onClick={toolbar.zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </SimpleTooltip>
        <SimpleTooltip side="top" content="Reset view">
          <Button
            type="button"
            aria-label="Reset view"
            size="toolbar-icon"
            variant="toolbar"
            disabled={toolbar.resetView.disabled}
            onClick={toolbar.resetView.onClick}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </SimpleTooltip>
        <div className="ml-1 flex items-center gap-0.5 rounded-xs border border-border/50 p-0.5 uppercase">
          {toolbar.fitTargets.map((target) => (
            <Button key={target.id} type="button" size="toolbar-tab" variant="toolbar" aria-pressed={target.isActive} onClick={target.onSelect}>
              {target.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-xs border border-border/30 p-0.5 shadow-sm">
        <Button
          type="button"
          aria-label="Rewind to start"
          size="toolbar-icon"
          variant="toolbar"
          disabled={toolbar.transport.isDisabled}
          onClick={toolbar.transport.resetToStart}
        >
          <Rewind className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          aria-label="Step back"
          size="toolbar-icon"
          variant="toolbar"
          disabled={toolbar.transport.isDisabled}
          onClick={toolbar.transport.stepBackward}
        >
          <StepBack className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          aria-label={toolbar.transport.isPlaying ? 'Pause' : 'Play'}
          size="toolbar-icon"
          variant={toolbar.transport.isPlaying ? 'secondary' : 'default'}
          disabled={toolbar.transport.isDisabled}
          onClick={toolbar.transport.isPlaying ? toolbar.transport.pause : toolbar.transport.play}
        >
          {toolbar.transport.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" strokeWidth={2} />}
        </Button>
        <Button
          type="button"
          aria-label="Step forward"
          size="toolbar-icon"
          variant="toolbar"
          disabled={toolbar.transport.isDisabled}
          onClick={toolbar.transport.stepForward}
        >
          <StepForward className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          aria-label="Rewind to end"
          size="toolbar-icon"
          variant="toolbar"
          disabled={toolbar.transport.isDisabled}
          onClick={toolbar.transport.jumpToEnd}
        >
          <Rewind className="h-3.5 w-3.5 rotate-180" />
        </Button>
      </div>

      <div className="flex w-48 shrink-0 items-center justify-end gap-4">
        <Button
          type="button"
          aria-label={toolbar.isMuted ? 'Unmute video' : 'Mute video'}
          aria-pressed={toolbar.isMuted}
          variant="ghost"
          size="toolbar-icon"
          onClick={toolbar.toggleMute}
        >
          {toolbar.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          {toolbar.timeLabel.current} / {toolbar.timeLabel.total}
        </span>
      </div>
    </div>
  )
}
