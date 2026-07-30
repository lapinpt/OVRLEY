import { useMemo } from 'react'
import { SlidersHorizontal, Type } from 'lucide-react'
import { buildUniformResizeUpdate } from '@/features/overlay-editor/utils/widgetResizeScaling'
import useDisplayVariantUpdater from '../../hooks/useDisplayVariantUpdater'
import { SectionHeading } from '../widgetEditorSections'
import { ColorField, SliderField } from '../widgetFormControls'
import FontSelectField from '@/components/ui/font-select-field'
import useAvailableFonts from '@/features/scene-settings/hooks/useAvailableFonts'

/**
 * Editor controls for the diameter-based lean-angle display type.
 *
 * @param {object} props
 * @param {object} props.widget - Widget config.
 * @param {Function} props.updateWidgetData - Updates widget data.
 * @returns {JSX.Element}
 */
export default function LeanAngleDisplaySection({ widget, updateWidgetData }) {
  const leanVariant = useMemo(() => widget.data.display_variants?.lean_angle ?? {}, [widget.data.display_variants?.lean_angle])
  const updateLean = useDisplayVariantUpdater(widget, 'lean_angle', leanVariant, updateWidgetData)

  const diameter = leanVariant.diameter
  const trackThicknessMax = Math.floor((diameter - 1) / 2)
  const borderThicknessMax = Math.min(8, Math.floor((leanVariant.track_thickness - 1) / 2))
  const availableFonts = useAvailableFonts()

  const handleDiameterChange = (nextDiameter) => {
    const update = buildUniformResizeUpdate(widget, nextDiameter)
    if (update) updateWidgetData(widget.id, update)
  }

  return (
    <>
      <div className="space-y-4">
        <SectionHeading icon={SlidersHorizontal} title="Angle Track" />
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Size"
            value={diameter}
            min={30}
            max={600}
            step={1}
            valueDisplay={`${Math.round(diameter)}px`}
            onSliderChange={handleDiameterChange}
          />
          <SliderField
            label="Thickness"
            value={leanVariant.track_thickness}
            min={1}
            max={trackThicknessMax}
            step={1}
            valueDisplay={`${leanVariant.track_thickness}px`}
            onSliderChange={(track_thickness) => updateLean({ track_thickness })}
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
        <div className="grid grid-cols-2 gap-4">
          <ColorField
            label="Border Color"
            value={leanVariant.track_border_color}
            onChange={(track_border_color) => updateLean({ track_border_color })}
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
      </div>
      <div className="space-y-4">
        <SectionHeading icon={Type} title="Label" />
        <div className="grid grid-cols-2 gap-4">
          <FontSelectField
            label="Label Font"
            value={widget.data.font}
            onValueChange={(font) => updateWidgetData(widget.id, { font })}
            recommendedFonts={availableFonts.recommendedFonts}
            systemFonts={availableFonts.systemFonts}
            triggerClassName="h-9 border-border/70 bg-surface text-xs"
            labelClassName="text-[9px] text-muted-foreground uppercase font-bold"
          />
          <SliderField
            label="Font Size"
            value={widget.data.font_size}
            min={6}
            max={200}
            valueDisplay={`${widget.data.font_size}px`}
            onSliderChange={(font_size) => updateWidgetData(widget.id, { font_size })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ColorField label="Label Color" value={widget.data.color} onChange={(color) => updateWidgetData(widget.id, { color })} />
          <ColorField label="Unit Color" value={widget.data.unit_color} onChange={(unit_color) => updateWidgetData(widget.id, { unit_color })} />
        </div>
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
      </div>
    </>
  )
}
