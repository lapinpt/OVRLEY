import { SelectField, SliderField, ToggleField } from '../widgetFormControls'

const BAR_COUNT_MAX = 64
const BAR_GAP_MAX = 24

const FILL_STYLE_OPTIONS = [
  { value: 'fill', label: 'Continuous' },
  { value: 'bars', label: 'Bars' },
]

function buildFillStyleUpdate(data, track_fill_style, suggestBarGeometry) {
  if (track_fill_style !== 'bars' || data.track_fill_style === 'bars') return { track_fill_style }

  const suggestion = suggestBarGeometry(data)
  return {
    track_fill_style,
    bar_count: suggestion.count,
    bar_gap: Math.round(suggestion.gap * 10) / 10,
  }
}

export default function BarFillStyleControls({ data, suggestBarGeometry, updateVariant }) {
  const segmented = data.track_fill_style === 'bars'

  return (
    <>
      <SelectField
        label="Fill Style"
        value={data.track_fill_style ?? 'fill'}
        onValueChange={(track_fill_style) => updateVariant(buildFillStyleUpdate(data, track_fill_style, suggestBarGeometry))}
        options={FILL_STYLE_OPTIONS}
      />
      {!segmented ? (
        <div className="flex items-center justify-between gap-2 px-1 pb-2 pt-2">
          <span className="text-[9px] font-bold uppercase text-muted-foreground">Flat</span>
          <ToggleField checked={data.track_fill_flat} onCheckedChange={(track_fill_flat) => updateVariant({ track_fill_flat })} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Bar Count"
            value={data.bar_count}
            min={1}
            max={BAR_COUNT_MAX}
            step={1}
            valueDisplay={`${data.bar_count}`}
            onSliderChange={(bar_count) => updateVariant({ bar_count })}
          />
          <SliderField
            label="Bar Gap"
            value={data.bar_gap}
            min={0}
            max={BAR_GAP_MAX}
            step={1}
            valueDisplay={`${data.bar_gap}px`}
            onSliderChange={(bar_gap) => updateVariant({ bar_gap })}
          />
        </div>
      )}
    </>
  )
}
