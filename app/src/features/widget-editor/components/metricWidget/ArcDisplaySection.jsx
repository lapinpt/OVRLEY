import { useMemo } from 'react'
import { SlidersHorizontal, Tags } from 'lucide-react'
import {
  getStandardMetricDefinition,
  getStandardMetricDisplayUnit,
  getStandardMetricUnitOptions,
  getStandardMetricUnitsMode,
} from '@/lib/widget/standard-metrics'
import FontSelectField from '@/components/ui/font-select-field'
import useAvailableFonts from '@/features/scene-settings/hooks/useAvailableFonts'
import useDisplayVariantUpdater from '../../hooks/useDisplayVariantUpdater'
import { FontSection, SectionHeading, UnitsControlRow } from '../widgetEditorSections'
import { ColorField, SliderField, ToggleField } from '../widgetFormControls'

const ARC_MIN_ANGLE = 30
const ARC_MAX_ANGLE = 360

/**
 * Arc-gauge-specific controls. The gauge owns track geometry in its display
 * variant; the value/unit typography remains shared top-level metric data.
 * Icons are deliberately absent from this editor because arc gauges do not
 * render them.
 */
export default function ArcDisplaySection({ widget, updateWidgetData }) {
  const arcData = useMemo(() => widget.data.display_variants?.arc ?? {}, [widget.data.display_variants?.arc])
  const updateArc = useDisplayVariantUpdater(widget, 'arc', arcData, updateWidgetData)
  const availableFonts = useAvailableFonts()
  const definition = getStandardMetricDefinition(widget.type)
  const unitOptions = getStandardMetricUnitOptions(widget.type)
  const unitsMode = getStandardMetricUnitsMode(widget.type)
  const supportsUnitSelection = unitOptions.length > 1
  const cornerRadiusMax = Math.max(0, (arcData.track_thickness ?? 0) * 0.5)

  const updateBoundedNumber = (key, rawValue, min, max) => {
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    updateArc({ [key]: Math.min(max, Math.max(min, value)) })
  }

  return (
    <>
      <div className="space-y-4">
        <SectionHeading icon={SlidersHorizontal} title="Arc Track" />
        <div className="grid grid-cols-1 gap-4 pt-2">
          <SliderField
            label="Arc Angle"
            value={arcData.arc_angle}
            min={ARC_MIN_ANGLE}
            max={ARC_MAX_ANGLE}
            step={5}
            valueDisplay={`${arcData.arc_angle}°`}
            onSliderChange={(arc_angle) => updateArc({ arc_angle })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Width"
            value={arcData.width}
            min={30}
            max={600}
            step={1}
            valueDisplay={`${arcData.width}px`}
            onSliderChange={(width) => updateArc({ width })}
          />
          <SliderField
            label="Height"
            value={arcData.height}
            min={30}
            max={600}
            step={1}
            valueDisplay={`${arcData.height}px`}
            onSliderChange={(height) => updateArc({ height })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Thickness"
            value={arcData.track_thickness}
            min={1}
            max={100}
            step={1}
            valueDisplay={`${arcData.track_thickness}px`}
            onSliderChange={(track_thickness) =>
              updateArc({
                track_thickness,
                track_corner_radius: Math.min(arcData.track_corner_radius ?? 0, track_thickness * 0.5),
              })
            }
          />
          <SliderField
            label="Corner Radius"
            value={arcData.track_corner_radius}
            min={0}
            max={cornerRadiusMax}
            step={1}
            valueDisplay={`${arcData.track_corner_radius}px`}
            onSliderChange={(track_corner_radius) => updateArc({ track_corner_radius })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorField label="Border Color" value={arcData.track_border_color} onChange={(track_border_color) => updateArc({ track_border_color })} />
          <SliderField
            label="Border"
            value={arcData.track_border_thickness}
            min={0}
            max={24}
            step={1}
            valueDisplay={`${arcData.track_border_thickness}px`}
            onSliderChange={(track_border_thickness) => updateArc({ track_border_thickness })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorField label="Empty Color" value={arcData.track_empty_color} onChange={(track_empty_color) => updateArc({ track_empty_color })} />
          <SliderField
            label="Empty Opacity"
            value={arcData.track_empty_opacity}
            min={0}
            max={1}
            step={0.05}
            valueDisplay={`${Math.round((arcData.track_empty_opacity ?? 0) * 100)}%`}
            onSliderChange={(track_empty_opacity) => updateArc({ track_empty_opacity })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorField label="Filled Color" value={arcData.track_filled_color} onChange={(track_filled_color) => updateArc({ track_filled_color })} />
          <SliderField
            label="Filled Opacity"
            value={arcData.track_filled_opacity}
            min={0}
            max={1}
            step={0.05}
            valueDisplay={`${Math.round((arcData.track_filled_opacity ?? 0) * 100)}%`}
            onSliderChange={(track_filled_opacity) => updateArc({ track_filled_opacity })}
          />
        </div>
      </div>

      <FontSection widget={widget} updateWidgetData={updateWidgetData} title="Inner Label" fontSizeLabel="Font Size" />
      <div className="grid grid-cols-2 gap-4">
        <SliderField
          label="Horizontal Offset"
          value={arcData.inner_widget_offset_x}
          min={-50}
          max={50}
          step={1}
          valueDisplay={`${arcData.inner_widget_offset_x}px`}
          onSliderChange={(value) => updateBoundedNumber('inner_widget_offset_x', value, -10_000, 10_000)}
        />
        <SliderField
          label="Horizontal Offset"
          value={arcData.inner_widget_offset_y}
          min={-50}
          max={50}
          step={1}
          valueDisplay={`${arcData.inner_widget_offset_y}px`}
          onSliderChange={(value) => updateBoundedNumber('inner_widget_offset_y', value, -10_000, 10_000)}
        />
      </div>

      {unitsMode !== 'hidden' ? (
        <UnitsControlRow
          title="Inner Unit"
          checked={widget.data.show_units ?? definition?.showUnitsByDefault ?? false}
          onCheckedChange={(show_units) => updateWidgetData(widget.id, { show_units })}
          colorValue={widget.data.unit_color}
          onColorChange={(unit_color) => updateWidgetData(widget.id, { unit_color })}
          selectLabel="Unit"
          value={getStandardMetricDisplayUnit(widget.type, widget.data)}
          onValueChange={(display_unit) => updateWidgetData(widget.id, { display_unit })}
          options={supportsUnitSelection ? unitOptions : undefined}
        />
      ) : null}

      <div className="space-y-4">
        <div className="flex w-full items-center gap-3">
          <SectionHeading icon={Tags} title="Min/Max Labels" />
          <div className="shrink-0 pt-1">
            <ToggleField checked={arcData.show_min_max_labels} onCheckedChange={(show_min_max_labels) => updateArc({ show_min_max_labels })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2">
          <FontSelectField
            label="Label Font"
            value={arcData.min_max_label_font}
            disabled={!arcData.show_min_max_labels}
            onValueChange={(min_max_label_font) => updateArc({ min_max_label_font })}
            recommendedFonts={availableFonts.recommendedFonts}
            systemFonts={availableFonts.systemFonts}
            triggerClassName="h-9 border-border/70 bg-surface text-xs"
            labelClassName="text-[9px] text-muted-foreground uppercase font-bold"
          />
          <SliderField
            label="Font Size"
            disabled={!arcData.show_min_max_labels}
            value={arcData.min_max_label_font_size}
            min={6}
            max={50}
            step={1}
            valueDisplay={`${arcData.min_max_label_font_size}px`}
            onSliderChange={(min_max_label_font_size) => updateArc({ min_max_label_font_size })}
          />
        </div>
        <ColorField
          label="Label Color"
          value={arcData.min_max_label_color}
          disabled={!arcData.show_min_max_labels}
          onChange={(min_max_label_color) => updateArc({ min_max_label_color })}
        />
      </div>
    </>
  )
}
