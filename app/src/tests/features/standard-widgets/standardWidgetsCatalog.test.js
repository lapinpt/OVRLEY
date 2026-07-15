import { describe, expect, test } from 'vitest'

import {
  BACKDROP_CIRCLE_DEFAULTS,
  BACKDROP_DEFAULT_DISPLAY_TYPES,
  BACKDROP_RECTANGLE_DEFAULTS,
  BACKDROP_TYPE_DEFINITIONS,
  BACKDROP_TYPE_LABELS,
  COURSE_PLOT_DEFAULTS,
  ELEVATION_PLOT_DEFAULTS,
  GRADIENT_DEFAULTS,
  TEXT_LABEL_DEFAULTS,
  getBackdropTypeOptions,
} from '@/lib/widget/standard-widgets'

describe('standard widget manifest contract', () => {
  test('preserves existing defaults through definition-backed exports', () => {
    expect(COURSE_PLOT_DEFAULTS).toMatchObject({
      value: 'course',
      width: 400,
      height: 200,
      completed_line_opacity: 100,
    })
    expect(ELEVATION_PLOT_DEFAULTS.point_label).toEqual({
      font: 'Arial.ttf',
      font_size: 12.5,
      color: '#ffffff',
    })
    expect(GRADIENT_DEFAULTS.triangle_width).toBe(72)
    expect(TEXT_LABEL_DEFAULTS.text).toBe('New Text')
  })

  test('exposes backdrop definitions and rectangle as the default display type', () => {
    expect(Object.keys(BACKDROP_TYPE_DEFINITIONS)).toEqual(['circle', 'rectangle'])
    expect(BACKDROP_TYPE_LABELS).toEqual({
      circle: 'Circle',
      rectangle: 'Rectangle',
    })
    expect(BACKDROP_DEFAULT_DISPLAY_TYPES).toEqual(['rectangle'])
    expect(BACKDROP_CIRCLE_DEFAULTS).toEqual({
      display_type: 'circle',
      x: 100,
      y: 100,
      opacity: 1,
      diameter: 200,
      fill_color: '#ffffff',
      fill_opacity: 1,
      border_thickness: 0,
      border_color: '#ffffff',
      border_opacity: 1,
    })
    expect(BACKDROP_RECTANGLE_DEFAULTS).toEqual({
      display_type: 'rectangle',
      x: 100,
      y: 100,
      opacity: 1,
      width: 200,
      height: 120,
      fill_color: '#ffffff',
      fill_opacity: 1,
      border_thickness: 0,
      border_color: '#ffffff',
      border_opacity: 1,
      corner_radius: 0,
      round_top_left: false,
      round_top_right: false,
      round_bottom_left: false,
      round_bottom_right: false,
    })
    expect(getBackdropTypeOptions()).toEqual([
      { value: 'circle', label: 'Circle' },
      { value: 'rectangle', label: 'Rectangle' },
    ])
  })
})
