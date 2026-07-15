import { describe, expect, test } from 'vitest'
import { getArcInnerWidgetLayout } from '@/features/widget-preview/widgets/arc-gauge/arcGaugeInnerLayout'

describe('arcGaugeInnerLayout', () => {
  test('stacks the unit below a horizontally centered value with unconstrained offsets', () => {
    const layout = getArcInnerWidgetLayout(
      { display_type: 'arc', font_size: 40, inner_widget_offset_x: 18, inner_widget_offset_y: -12 },
      { centerX: 80, centerY: 80 },
      {
        unitText: 'KM/H',
        valueMeasure: { width: 40, boundsLeft: 0, boundsRight: 40, glyphHeight: 28, ascent: 22, descent: 6 },
        valueVerticalMeasure: { glyphHeight: 28, ascent: 22, descent: 6 },
        unitMeasure: { width: 30, boundsLeft: 0, boundsRight: 30, glyphHeight: 10, ascent: 8, descent: 2 },
      },
    )

    expect(layout.value.x).toBe(78)
    expect(layout.unit.x).toBe(83)
    expect(layout.unit.top).toBeGreaterThan(layout.value.top)
    expect(layout.unit.baseline).toBeGreaterThan(layout.value.baseline)
    expect(layout.centerX).toBe(98)
  })

  test('centers the dynamic value from its advance, not its glyph bounds', () => {
    const layout = getArcInnerWidgetLayout(
      { display_type: 'arc', font_size: 40, inner_widget_offset_x: 0, inner_widget_offset_y: 0 },
      { centerX: 100, centerY: 80 },
      {
        unitText: '',
        valueMeasure: { width: 40, boundsLeft: -4, boundsRight: 36, glyphHeight: 28, ascent: 22, descent: 6 },
        valueVerticalMeasure: { glyphHeight: 28, ascent: 22, descent: 6 },
      },
    )

    expect(layout.value.x).toBe(80)
  })
})
