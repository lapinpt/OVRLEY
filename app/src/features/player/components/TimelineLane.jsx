/**
 * Presentational clip lane renderer.
 *
 * @param {{ lane: object }} props Lane view model.
 */
export default function TimelineLane({ lane }) {
  const Icon = lane.icon

  return (
    <div aria-label={lane.ariaLabel} className={`relative w-full ${lane.isVideo ? 'h-6 border-b-0' : 'h-6'}`}>
      <div data-testid="timeline-lane-clip-mask" className="absolute inset-x-0 -top-3 -bottom-1 overflow-hidden">
        {lane.isVisible && (
          <div
            aria-describedby={lane.tooltip.isVisible ? lane.tooltip.id : undefined}
            aria-label={lane.label || 'clip'}
            className="absolute top-3 bottom-1 z-10 cursor-grab touch-none active:cursor-grabbing"
            style={lane.clipStyle}
            {...lane.clipProps}
          >
            <div className={`absolute inset-0 overflow-visible ${lane.clipClassName}`}>
              {lane.highlightStyle && (
                <div aria-hidden="true" className="pointer-events-none absolute -top-3 -bottom-1 bg-success/20" style={lane.highlightStyle} />
              )}
              {lane.showText && (
                <div
                  className={`relative grid h-full items-center gap-3 overflow-hidden whitespace-nowrap px-2.5 text-[0.7rem] font-bold uppercase leading-none ${lane.textClassName}`}
                  style={{ gridTemplateColumns: `${lane.sourceColumnWidth} minmax(0, 1fr) auto` }}
                >
                  <span className={`flex min-w-0 items-center justify-left pl-2 ${lane.clipContentClassName}`}>
                    {Icon ? (
                      <Icon className="h-5 w-5 shrink-0 pb-0.5" strokeWidth={3} aria-hidden="true" />
                    ) : (
                      <span className="block max-w-full truncate text-[0.85rem] font-black leading-none">{lane.formatLabel}</span>
                    )}
                  </span>
                  <span className={`min-w-0 truncate leading-none ${lane.clipContentClassName}`}>{lane.label}</span>
                  <span className={`shrink-0 pl-1 tabular-nums leading-none ${lane.clipContentClassName}`}>{lane.durationLabel}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {lane.tooltip.isVisible && lane.label && (
        <div
          id={lane.tooltip.id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full z-1000 mb-2 min-w-40 -translate-x-1/2 whitespace-nowrap rounded border border-border/70 bg-surface-tooltip px-2.5 py-1.5 text-left text-xs text-foreground shadow-2xl"
          style={lane.tooltip.style}
        >
          <div className="text-[0.72rem] font-semibold leading-snug">{lane.label}</div>
          <div className="mt-1 flex items-center justify-between gap-4 border-t border-border/40 pt-1 text-[0.65rem] text-muted-foreground">
            <span className="font-medium">Duration</span>
            <span className="tabular-nums text-foreground">{lane.durationLabel}</span>
          </div>
          <div className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-4 border-transparent border-t-surface-tooltip" />
        </div>
      )}
    </div>
  )
}
