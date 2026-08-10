import { Gauge } from 'lucide-react'
import { NumberField, ToggleField } from '../widgetFormControls'
import { SectionHeading } from '../widgetEditorSections'
import { getStandardMetricDisplayUnit, getStandardMetricUnitLabel } from '@/lib/widget/standard-metrics'
import { gaugeRangeValueToCanonical, gaugeRangeValueToDisplay } from '@/features/widget-preview/shared/gaugeMetricRange'

export default function GaugeRangeSection({ widget, updateWidgetData }) {
  const range = widget.data.gauge_range
  const auto = !range
  const metric = widget.type
  const displayUnit = getStandardMetricDisplayUnit(metric, widget.data)
  const unitLabel = getStandardMetricUnitLabel(metric, displayUnit)
  const displayRange = range && {
    min: gaugeRangeValueToDisplay(metric, range.min, displayUnit),
    max: gaugeRangeValueToDisplay(metric, range.max, displayUnit),
  }
  const updateRangeValue = (key, rawValue) => {
    const value = gaugeRangeValueToCanonical(metric, Number(rawValue), displayUnit)
    if (!Number.isFinite(value)) return
    const next = { ...range, [key]: value }
    if (!(next.min < next.max)) return
    updateWidgetData(widget.id, { gauge_range: next })
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-3">
        <SectionHeading icon={Gauge} title="Gauge Range" />
        <div className="shrink-0 pt-1">
          <ToggleField
            checked={auto}
            onCheckedChange={(checked) => updateWidgetData(widget.id, { gauge_range: checked ? null : { min: 0, max: 100 } })}
          />
        </div>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Auto</span>
      </div>
      {!auto ? (
        <div className="grid grid-cols-2 gap-4">
          <NumberField
            label={`Minimum${unitLabel ? ` (${unitLabel})` : ''}`}
            value={displayRange.min}
            onChange={(value) => updateRangeValue('min', value)}
            step={1}
          />
          <NumberField
            label={`Maximum${unitLabel ? ` (${unitLabel})` : ''}`}
            value={displayRange.max}
            onChange={(value) => updateRangeValue('max', value)}
            step={1}
          />
        </div>
      ) : null}
    </div>
  )
}
