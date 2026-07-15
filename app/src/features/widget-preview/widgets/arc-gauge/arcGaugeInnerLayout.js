/** Text and unit layout for the inner presentation of an arc-shaped gauge. */

export const ARC_INNER_WIDGET_LINE_HEIGHT = 0.92
export const ARC_INNER_WIDGET_UNIT_RATIO = 0.28
export const ARC_INNER_WIDGET_MIN_UNIT_FONT_SIZE = 12
export const ARC_INNER_WIDGET_GAP_PX = 4

/**
 * Calculates the inner value/unit layout from normalized gauge data.
 * @param {object} data - Normalized gauge data.
 * @param {object} layout - Computed arc or corner layout.
 * @param {object} model - Formatted and measured inner content.
 * @returns {object} Positioned value and optional unit layout.
 */
export function getArcInnerWidgetLayout(data, layout, model) {
  const centerX = data.display_type === 'corner' ? layout.innerAnchor.x : layout.centerX
  const centerY = data.display_type === 'corner' ? layout.innerAnchor.y : layout.centerY
  const unitFontSize = Math.max(data.font_size * ARC_INNER_WIDGET_UNIT_RATIO, ARC_INNER_WIDGET_MIN_UNIT_FONT_SIZE)
  const valueLineHeight = data.font_size * ARC_INNER_WIDGET_LINE_HEIGHT
  const unitLineHeight = unitFontSize * ARC_INNER_WIDGET_LINE_HEIGHT
  const gap = Math.max(data.font_size * 0.08, ARC_INNER_WIDGET_GAP_PX)
  const unitVisible = model.unitText !== ''
  const groupHeight = unitVisible ? valueLineHeight + gap + unitLineHeight : valueLineHeight
  const groupTop = centerY + data.inner_widget_offset_y - groupHeight * 0.5
  const contentCenterX = centerX + data.inner_widget_offset_x
  const valueX = contentCenterX - model.valueMeasure.width * 0.5
  const valueBaseline = groupTop + (valueLineHeight - model.valueVerticalMeasure.glyphHeight) * 0.5 + model.valueVerticalMeasure.ascent

  return {
    centerX: contentCenterX,
    groupTop,
    groupHeight,
    value: {
      x: valueX,
      top: groupTop,
      baseline: valueBaseline,
      lineHeight: valueLineHeight,
    },
    unit: unitVisible
      ? {
          x: contentCenterX - (model.unitMeasure.boundsLeft + model.unitMeasure.boundsRight) * 0.5,
          top: groupTop + valueLineHeight + gap,
          baseline: groupTop + valueLineHeight + gap + (unitLineHeight - model.unitMeasure.glyphHeight) * 0.5 + model.unitMeasure.ascent,
          fontSize: unitFontSize,
          lineHeight: unitLineHeight,
        }
      : null,
  }
}
