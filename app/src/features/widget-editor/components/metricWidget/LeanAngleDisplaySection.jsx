import { useMemo } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { buildUniformResizeUpdate } from '@/features/overlay-editor/utils/widgetResizeScaling'
import {
  getStandardMetricDefinition,
  getStandardMetricDisplayUnit,
  getStandardMetricUnitOptions,
  getStandardMetricUnitsMode,
} from '@/lib/widget/standard-metrics'
import useDisplayVariantUpdater from '../../hooks/useDisplayVariantUpdater'
import { FontSection, SectionHeading, UnitsControlRow } from '../widgetEditorSections'
import { ColorField, SliderField } from '../widgetFormControls'
import { getLeanAngleOuterRadius } from '@/features/widget-preview/widgets/lean-angle/geometry'

/**
 * Editor controls for the fixed-ratio lean-angle display type.
 *
 * @param {object} props
 * @param {object} props.widget - Widget config.
 * @param {Function} props.updateWidgetData - Updates widget data.
 * @returns {JSX.Element}
 */
export default function LeanAngleDisplaySection({ widget, updateWidgetData }) {
  const leanVariant = useMemo(() => widget.data.display_variants?.lean_angle ?? {}, [widget.data.display_variants?.lean_angle])
  const updateLean = useDisplayVariantUpdater(widget, 'lean_angle', leanVariant, updateWidgetData)
  const definition = getStandardMetricDefinition(widget.type)
  const unitsMode = getStandardMetricUnitsMode(widget.type)
  const unitOptions = getStandardMetricUnitOptions(widget.type)
  const size = leanVariant.width ?? widget.data.width
  const trackThicknessMax = Math.floor(getLeanAngleOuterRadius(leanVariant.width, leanVariant.height) - 1)
  const borderThicknessMax = Math.min(24, Math.floor((leanVariant.track_thickness - 1) / 2))

  const handleSizeChange = (nextSize) => {
    const update = buildUniformResizeUpdate(widget, nextSize)
    if (update) updateWidgetData(widget.id, update)
  }

  return (
    <>
      <div className="space-y-4">
        <SectionHeading icon={SlidersHorizontal} title="Lean Angle" />
        <SliderField label="Size" value={size} min={30} max={600} step={1} valueDisplay={`${Math.round(size)}px`} onSliderChange={handleSizeChange} />
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Thickness"
            value={leanVariant.track_thickness}
            min={1}
            max={trackThicknessMax}
            step={1}
            valueDisplay={`${leanVariant.track_thickness}px`}
            onSliderChange={(track_thickness) => updateLean({ track_thickness })}
          />
          <SliderField
            label="Border"
            value={leanVariant.track_border_thickness}
            min={0}
            max={borderThicknessMax}
            step={1}
            valueDisplay={`${leanVariant.track_border_thickness}px`}
            onSliderChange={(track_border_thickness) => updateLean({ track_border_thickness })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorField label="Empty Color" value={leanVariant.track_empty_color} onChange={(track_empty_color) => updateLean({ track_empty_color })} />
          <SliderField
            label="Empty Opacity"
            value={leanVariant.track_empty_opacity}
            min={0}
            max={1}
            step={0.05}
            valueDisplay={`${Math.round(leanVariant.track_empty_opacity * 100)}%`}
            onSliderChange={(track_empty_opacity) => updateLean({ track_empty_opacity })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorField
            label="Filled Color"
            value={leanVariant.track_filled_color}
            onChange={(track_filled_color) => updateLean({ track_filled_color })}
          />
          <SliderField
            label="Filled Opacity"
            value={leanVariant.track_filled_opacity}
            min={0}
            max={1}
            step={0.05}
            valueDisplay={`${Math.round(leanVariant.track_filled_opacity * 100)}%`}
            onSliderChange={(track_filled_opacity) => updateLean({ track_filled_opacity })}
          />
        </div>
        <ColorField label="Border Color" value={leanVariant.track_border_color} onChange={(track_border_color) => updateLean({ track_border_color })} />
      </div>

      <FontSection widget={widget} updateWidgetData={updateWidgetData} title="Label" />
      <div className="grid grid-cols-2 gap-4">
        <SliderField
          label="Horizontal Offset"
          value={leanVariant.value_offset_x}
          min={-50}
          max={50}
          step={1}
          valueDisplay={`${leanVariant.value_offset_x}px`}
          onSliderChange={(value_offset_x) => updateLean({ value_offset_x })}
        />
        <SliderField
          label="Vertical Offset"
          value={leanVariant.value_offset_y}
          min={-50}
          max={50}
          step={1}
          valueDisplay={`${leanVariant.value_offset_y}px`}
          onSliderChange={(value_offset_y) => updateLean({ value_offset_y })}
        />
      </div>

      {unitsMode !== 'hidden' ? (
        <UnitsControlRow
          title="Unit"
          checked={widget.data.show_units ?? definition?.showUnitsByDefault ?? false}
          onCheckedChange={(show_units) => updateWidgetData(widget.id, { show_units })}
          colorValue={widget.data.unit_color}
          onColorChange={(unit_color) => updateWidgetData(widget.id, { unit_color })}
          selectLabel="Unit"
          value={getStandardMetricDisplayUnit(widget.type, widget.data)}
          onValueChange={(display_unit) => updateWidgetData(widget.id, { display_unit })}
          options={unitOptions.length > 1 ? unitOptions : undefined}
        />
      ) : null}
    </>
  )
}
