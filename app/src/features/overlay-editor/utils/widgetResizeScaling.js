/**
 * Pure widget-content scaling policies used by resize and scale interactions.
 *
 * Moveable owns pointer geometry; this module owns how a widget's dimensional
 * data follows that geometry. Presentation-specific strategies keep the
 * interaction hooks free from display-variant field knowledge.
 */

import { clamp } from '@/lib/utils'
import { buildFrameGeometryUpdate, resolveActiveMetricWidgetData } from '@/lib/widget/widget-resolver'

function scaleNumber(value, scaleFactor, { min = -Infinity, max = Infinity, round = true } = {}) {
  const scaledValue = value * scaleFactor
  const roundedValue = round ? Math.round(scaledValue) : scaledValue

  return clamp(roundedValue, min, max)
}

function getResizePolicy(widget) {
  return RESIZE_POLICIES.find(({ matches }) => matches(widget)) || null
}

function captureArcResizeOrigin(widget) {
  const data = resolveActiveMetricWidgetData(widget.data)

  return {
    variants: widget.data.display_variants,
    data,
  }
}

function buildArcResizeContentDraft(origin, scaleFactor, { round = true } = {}) {
  const arcVariant = origin.variants.arc
  const { data } = origin
  const trackThickness = scaleNumber(data.track_thickness, scaleFactor, { min: 1, max: 100, round })
  const trackCornerRadius = scaleNumber(data.track_corner_radius, scaleFactor, {
    min: 0,
    max: trackThickness * 0.5,
    round,
  })

  return {
    font_size: scaleNumber(data.font_size, scaleFactor, { min: 8, max: 400, round }),
    display_variants: {
      ...origin.variants,
      arc: {
        ...arcVariant,
        track_thickness: trackThickness,
        track_corner_radius: trackCornerRadius,
        track_border_thickness: scaleNumber(data.track_border_thickness, scaleFactor, { min: 0, max: 24, round }),
        inner_widget_offset_x: scaleNumber(data.inner_widget_offset_x, scaleFactor, { min: -10_000, max: 10_000, round }),
        inner_widget_offset_y: scaleNumber(data.inner_widget_offset_y, scaleFactor, { min: -10_000, max: 10_000, round }),
        min_max_label_font_size: scaleNumber(data.min_max_label_font_size, scaleFactor, { min: 6, max: 50, round }),
      },
    },
  }
}

const RESIZE_POLICIES = [
  {
    matches: (widget) => widget?.data?.display_type === 'arc',
    captureOrigin: captureArcResizeOrigin,
    buildDraft: buildArcResizeContentDraft,
  },
]

/**
 * Captures presentation-specific dimensional values at resize start.
 *
 * @param {object|null} widget - Selected editor widget.
 * @returns {object|null} Scale origin or null when the widget has no strategy.
 */
export function captureResizeOrigin(widget) {
  const policy = getResizePolicy(widget)
  return policy ? policy.captureOrigin(widget) : null
}

/**
 * Returns a uniform frame scale for a ratio-preserving resize.
 *
 * @param {object} origin - Resize origin containing width and height.
 * @param {number} width - Current frame width in widget coordinates.
 * @param {number} height - Current frame height in widget coordinates.
 * @returns {number} Uniform scale factor.
 */
export function getResizeScaleFactor(origin, width, height) {
  return (width / origin.width + height / origin.height) * 0.5
}

/**
 * Builds a live content draft for a ratio-preserving resize.
 *
 * @param {object|null} widget - Selected editor widget.
 * @param {object} origin - Resize origin with strategy-specific values.
 * @param {number} scaleFactor - Uniform frame scale.
 * @param {object} [options]
 * @param {boolean} [options.round=false] - Round values for persistence.
 * @returns {object} Top-level and nested content draft.
 */
export function buildResizeContentDraft(widget, origin, scaleFactor, { round = false } = {}) {
  const policy = getResizePolicy(widget)
  return policy ? policy.buildDraft(origin, scaleFactor, { round }) : {}
}

/**
 * Merges a content draft with the normal frame update while preserving the
 * durable display-variant shape. Frame geometry wins when both drafts contain
 * width, height, or rotation.
 *
 * @param {object|null} widgetData - Current stored widget data.
 * @param {object} framePatch - Position/frame update.
 * @param {object} contentDraft - Presentation-specific scaled content.
 * @returns {object} Commit-ready widget update patch.
 */
export function buildResizeUpdate(widgetData, framePatch, contentDraft = {}) {
  const frameUpdate = buildFrameGeometryUpdate(widgetData, framePatch)
  const { display_variants: contentVariants, ...topLevelContent } = contentDraft

  if (!contentVariants) {
    return { ...frameUpdate, ...topLevelContent }
  }

  const baseVariants = widgetData?.display_variants || {}
  const frameVariants = frameUpdate.display_variants || {}
  const variantKeys = new Set([...Object.keys(baseVariants), ...Object.keys(contentVariants), ...Object.keys(frameVariants)])
  const displayVariants = {}

  variantKeys.forEach((variantKey) => {
    const mergedVariant = {
      ...(baseVariants[variantKey] || {}),
      ...(contentVariants[variantKey] || {}),
    }

    const frameVariant = frameVariants[variantKey] || {}
    for (const key of ['width', 'height', 'rotation']) {
      if (Object.hasOwn(frameVariant, key)) {
        mergedVariant[key] = frameVariant[key]
      }
    }

    displayVariants[variantKey] = mergedVariant
  })

  return {
    ...frameUpdate,
    ...topLevelContent,
    display_variants: displayVariants,
  }
}

/**
 * Builds a draft for the existing uniform scale interaction used by intrinsic
 * metric, label, and gradient widgets.
 *
 * @param {object} data - Normalized widget data at interaction start.
 * @param {number} scaleFactor - Uniform scale multiplier.
 * @param {object} widget - Widget definition.
 * @param {object} [options]
 * @param {boolean} [options.round=true] - Round values for persistence.
 * @returns {object} Draft with scaled properties.
 */
export function buildScaleDraft(data, scaleFactor, widget, { round = true } = {}) {
  const nextFontSize = scaleNumber(data.font_size, scaleFactor, { min: 8, max: 400, round })
  const nextDraft = {
    font_size: nextFontSize,
  }

  if (widget?.category === 'values' && widget.type !== 'gradient') {
    Object.assign(nextDraft, {
      icon_size: scaleNumber(data.icon_size, scaleFactor, { min: 0, max: 400, round }),
      icon_offset_x: scaleNumber(data.icon_offset_x, scaleFactor, { round }),
      icon_offset_y: scaleNumber(data.icon_offset_y, scaleFactor, { round }),
    })
  }

  if (widget?.type === 'gradient') {
    Object.assign(nextDraft, {
      triangle_width: scaleNumber(data.triangle_width, scaleFactor, { min: 0, max: 600, round }),
      value_offset: scaleNumber(data.value_offset, scaleFactor, { round }),
    })
  }

  return nextDraft
}
