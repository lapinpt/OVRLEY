import { describe, expect, test } from 'vitest'
import {
  buildResizeContentDraft,
  buildResizeUpdate,
  buildScaleDraft,
  captureResizeOrigin,
  getResizeScaleFactor,
} from '@/features/overlay-editor/utils/widgetResizeScaling'

function makeArcWidget() {
  return {
    id: 'arc-1',
    type: 'speed',
    category: 'values',
    data: {
      display_type: 'arc',
      font_size: 60,
      display_variants: {
        arc: {
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
  test('scales arc content while preserving unrelated variant settings', () => {
    const widget = makeArcWidget()
    const origin = { width: 220, height: 220, ...captureResizeOrigin(widget) }
    const draft = buildResizeContentDraft(widget, origin, 2)

    expect(draft.font_size).toBe(120)
    expect(draft.display_variants.arc).toMatchObject({
      width: 220,
      height: 220,
      arc_angle: 225,
      track_thickness: 48,
      track_corner_radius: 24,
      track_border_thickness: 4,
      inner_widget_offset_x: 10,
      inner_widget_offset_y: -6,
      min_max_label_font_size: 24,
      track_empty_color: '#222222',
    })
  })

  test('merges scaled content with frame geometry without losing variant data', () => {
    const widget = makeArcWidget()
    const origin = { width: 220, height: 220, ...captureResizeOrigin(widget) }
    const contentDraft = buildResizeContentDraft(widget, origin, 2, { round: true })
    const update = buildResizeUpdate(widget.data, { x: 30, y: 40, width: 440, height: 440 }, contentDraft)

    expect(update).toMatchObject({ x: 30, y: 40, width: 440, height: 440, font_size: 120 })
    expect(update.display_variants.arc).toMatchObject({
      width: 440,
      height: 440,
      arc_angle: 225,
      track_thickness: 48,
      track_empty_color: '#222222',
    })
  })

  test('derives a uniform resize factor from either frame dimension', () => {
    const origin = { width: 220, height: 220 }

    expect(getResizeScaleFactor(origin, 440, 440)).toBe(2)
    expect(getResizeScaleFactor(origin, 330, 330)).toBe(1.5)
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
