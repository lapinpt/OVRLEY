import { describe, expect, test } from 'vitest'
import {
  buildResizeUpdate,
  buildScaleDraft,
  buildUniformResizeUpdate,
  captureResizeOrigin,
} from '@/features/overlay-editor/utils/widgetResizeScaling'

function makeGaugeWidget(displayType = 'arc') {
  return {
    id: 'arc-1',
    type: 'speed',
    category: 'values',
    data: {
      display_type: displayType,
      font_size: 60,
      display_variants: {
        [displayType]: {
          width: 220,
          height: 220,
          arc_angle: 225,
          track_thickness: 24,
          track_corner_radius: 15,
          track_border_thickness: 2,
          inner_widget_offset_x: 5,
          inner_widget_offset_y: -3,
          min_max_label_font_size: 12,
          track_empty_color: '#222222',
        },
      },
    },
  }
}

describe('widgetResizeScaling', () => {
  test('builds a complete arc resize update without losing variant data', () => {
    const widget = makeGaugeWidget()
    const origin = captureResizeOrigin(widget)
    const update = buildResizeUpdate(origin, { x: 30, y: 40, width: 440, height: 440 }, { round: true })

    expect(update).toMatchObject({ x: 30, y: 40, width: 440, height: 440, font_size: 120 })
    expect(update.display_variants.arc).toMatchObject({
      width: 440,
      height: 440,
      arc_angle: 225,
      track_thickness: 48,
      track_empty_color: '#222222',
    })
  })

  test('uses the same content policy for corner handle and Size-slider updates', () => {
    const widget = makeGaugeWidget('corner')
    const handleUpdate = buildResizeUpdate(captureResizeOrigin(widget), { width: 440, height: 440 }, { round: true })
    const sliderUpdate = buildUniformResizeUpdate(widget, 440)

    expect(sliderUpdate).toEqual(handleUpdate)
    expect(sliderUpdate).toMatchObject({
      font_size: 120,
      display_variants: {
        corner: {
          width: 440,
          height: 440,
          track_thickness: 48,
          track_corner_radius: 24,
          track_border_thickness: 4,
          inner_widget_offset_x: 10,
          inner_widget_offset_y: -6,
          min_max_label_font_size: 24,
        },
      },
    })
  })

  test('keeps the existing intrinsic-widget scale policy in the shared module', () => {
    const draft = buildScaleDraft(
      {
        font_size: 40,
        icon_size: 20,
        icon_offset_x: 2,
        icon_offset_y: -4,
        triangle_width: 72,
        value_offset: 0,
      },
      1.5,
      { category: 'values', type: 'speed' },
    )

    expect(draft).toEqual({
      font_size: 60,
      icon_size: 30,
      icon_offset_x: 3,
      icon_offset_y: -6,
    })
  })
})
