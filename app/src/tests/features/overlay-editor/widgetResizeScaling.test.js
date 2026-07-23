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

function makeLeanAngleWidget() {
  return {
    id: 'lean-angle-1',
    type: 'lean_angle',
    category: 'values',
    data: {
      display_type: 'lean_angle',
      font_size: 60,
      show_units: true,
      show_icon: false,
      prefix: 'L',
      suffix: 'R',
      opacity: 0.75,
      display_variants: {
        lean_angle: {
          width: 180,
          height: 140,
          track_thickness: 24,
          track_border_thickness: 2,
          value_offset_x: 5,
          value_offset_y: -3,
          track_empty_color: '#222222',
          track_empty_opacity: 0.5,
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

  test('keeps lean-angle frames locked and scales only lean-angle geometry', () => {
    const widget = makeLeanAngleWidget()
    const origin = captureResizeOrigin(widget)
    const update = buildResizeUpdate(origin, { x: 30, y: 40, width: 360, height: 200 }, { round: true })

    expect(update).toMatchObject({ x: 30, y: 40, width: 360, height: 280, font_size: 120 })
    expect(update.width / update.height).toBe(180 / 140)
    expect(update.display_variants.lean_angle).toMatchObject({
      width: 360,
      height: 280,
      track_thickness: 48,
      track_border_thickness: 4,
      value_offset_x: 10,
      value_offset_y: -6,
      track_empty_color: '#222222',
      track_empty_opacity: 0.5,
    })
    expect(update.display_variants.lean_angle).not.toHaveProperty('font_size')
    expect(update).not.toHaveProperty('show_units')
    expect(update).not.toHaveProperty('show_icon')
    expect(update).not.toHaveProperty('prefix')
    expect(update).not.toHaveProperty('suffix')
    expect(update).not.toHaveProperty('opacity')
    expect(update).not.toHaveProperty('display_type')
  })

  test('builds lean-angle Size updates with the default frame ratio', () => {
    const update = buildUniformResizeUpdate(makeLeanAngleWidget(), 360)

    expect(update).toMatchObject({ width: 360, height: 280 })
    expect(update.width / update.height).toBe(180 / 140)
  })
})
