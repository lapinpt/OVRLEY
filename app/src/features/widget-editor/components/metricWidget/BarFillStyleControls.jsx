import { SelectField, SliderField, ToggleField } from '../widgetFormControls'

const BAR_COUNT_MAX = 64

const FILL_STYLE_OPTIONS = [
  { value: 'fill', label: 'Continuous Fill' },
  { value: 'bars', label: 'Segmented Bars' },
]

function buildFillStyleUpdate(data, track_fill_style, suggestBarGeometry) {
  if (track_fill_style !== 'bars' || data.track_fill_style === 'bars') return { track_fill_style }

  const suggestion = suggestBarGeometry(data)
  return {
    track_fill_style,
    bar_count: suggestion.count,
    bar_gap: suggestion.gap,
    track_corner_radius: Math.min(data.track_corner_radius, suggestion.cornerRadiusMax),
  }
}

function buildBarGeometryUpdate(data, update, getCornerRadiusMax) {
  return {
    ...update,
    track_corner_radius: Math.min(data.track_corner_radius, getCornerRadiusMax({ ...data, ...update })),
  }
}

export function BarFillStyleField({ data, suggestBarGeometry, updateVariant }) {
  return (
    <SelectField
      label="Track Style"
      value={data.track_fill_style ?? 'fill'}
      onValueChange={(track_fill_style) => updateVariant(buildFillStyleUpdate(data, track_fill_style, suggestBarGeometry))}
      options={FILL_STYLE_OPTIONS}
      contentProps={{ position: 'popper', side: 'bottom', align: 'start' }}
    />
  )
}

export function BarFillStyleDetails({ data, barGapMax, getCornerRadiusMax, updateVariant, updateVariantSize, commitWidgetSize, widgetId }) {
  if (data.track_fill_style !== 'bars') {
    return (
      <div className="flex items-center justify-between gap-2 px-1 pb-2 pt-2">
        <span className="text-[9px] font-bold uppercase text-muted-foreground">Flat Track</span>
        <ToggleField checked={data.track_fill_flat} onCheckedChange={(track_fill_flat) => updateVariant({ track_fill_flat })} />
      </div>
    )
  }

  return (
    <>
      <SliderField
        label="Bar Count"
        value={data.bar_count}
        min={2}
        max={BAR_COUNT_MAX}
        step={1}
        integerDisplay
        valueDisplay={`${data.bar_count}`}
        onSliderChange={(bar_count) => updateVariantSize(buildBarGeometryUpdate(data, { bar_count }, getCornerRadiusMax))}
        onSliderCommit={() => commitWidgetSize(widgetId)}
      />
      <SliderField
        label="Bar Gap"
        value={data.bar_gap}
        min={0}
        max={barGapMax}
        step={1}
        integerDisplay
        valueDisplay={`${data.bar_gap}px`}
        onSliderChange={(bar_gap) => updateVariantSize(buildBarGeometryUpdate(data, { bar_gap }, getCornerRadiusMax))}
        onSliderCommit={() => commitWidgetSize(widgetId)}
      />
    </>
  )
}
