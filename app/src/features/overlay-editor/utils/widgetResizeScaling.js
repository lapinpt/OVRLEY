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

const GAUGE_DISPLAY_TYPES = new Set(['arc', 'corner', 'lean_angle'])
const LEAN_ANGLE_FRAME_HEIGHT_RATIO = 140 / 180

function isLeanAngleDisplayType(displayType) {
  return displayType === 'lean_angle'
}

/**
 * Returns whether a display type uses the uniform content-resize policy.
 *
 * @param {string} displayType - Persisted display type.
 * @returns {boolean} Whether the display type scales its dimensional content with the frame.
 */
export function isUniformResizeDisplayType(displayType) {
  return GAUGE_DISPLAY_TYPES.has(displayType)
}

function isGauge(widget) {
  return GAUGE_DISPLAY_TYPES.has(widget?.data?.display_type)
}

function captureGaugeResizeOrigin(widget, data) {
  const displayType = widget.data.display_type

  return {
    displayType,
    data,
    variant: widget.data.display_variants?.[displayType] ?? {},
  }
}

function buildGaugeResizeContentDraft(origin, scaleFactor, { round = true } = {}) {
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
      [origin.displayType]: {
        ...origin.variant,
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

function buildLeanAngleResizeContentDraft(origin, scaleFactor, { round = true } = {}) {
  const { data } = origin

  return {
    font_size: scaleNumber(data.font_size, scaleFactor, { min: 8, max: 400, round }),
    display_variants: {
      [origin.displayType]: {
        ...origin.variant,
        track_thickness: scaleNumber(data.track_thickness, scaleFactor, { min: 1, max: 100, round }),
        track_border_thickness: scaleNumber(data.track_border_thickness, scaleFactor, { min: 0, max: 24, round }),
        value_offset_x: scaleNumber(data.value_offset_x, scaleFactor, { min: -10_000, max: 10_000, round }),
        value_offset_y: scaleNumber(data.value_offset_y, scaleFactor, { min: -10_000, max: 10_000, round }),
      },
    },
  }
}

function getResizeScaleFactor(origin, width, height) {
  if (isLeanAngleDisplayType(origin.displayType)) return width / origin.width
  return (width / origin.width + height / origin.height) * 0.5
}

function buildResizeContentDraft(origin, scaleFactor, options) {
  if (isLeanAngleDisplayType(origin.displayType)) return buildLeanAngleResizeContentDraft(origin, scaleFactor, options)
  return GAUGE_DISPLAY_TYPES.has(origin.displayType) ? buildGaugeResizeContentDraft(origin, scaleFactor, options) : {}
}

function lockResizeFrame(origin, framePatch, { round = false } = {}) {
  if (!isLeanAngleDisplayType(origin.displayType)) return framePatch

  return {
    ...framePatch,
    height: round ? Math.round(framePatch.width * LEAN_ANGLE_FRAME_HEIGHT_RATIO) : framePatch.width * LEAN_ANGLE_FRAME_HEIGHT_RATIO,
  }
}

/**
 * Captures all data needed to produce resize updates from a widget frame.
 *
 * @param {object|null} widget - Selected editor widget.
 * @param {object} [frameData] - Resolved active frame data, when the caller has it.
 * @returns {object|null} Resize origin or null when the widget has no data.
 */
export function captureResizeOrigin(widget, frameData = resolveActiveMetricWidgetData(widget?.data)) {
  if (!widget?.data) return null

  const origin = {
    widgetData: widget.data,
    width: frameData?.width ?? widget.data.width ?? 0,
    height: frameData?.height ?? widget.data.height ?? 0,
  }

  return isGauge(widget) ? { ...origin, ...captureGaugeResizeOrigin(widget, frameData) } : origin
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
function mergeResizeUpdate(widgetData, framePatch, contentDraft = {}) {
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
 * Builds a complete resize update from a frame patch, using the same content
 * scaling and durable geometry merge as a resize-handle commit.
 *
 * @param {object} origin - Resize origin from captureResizeOrigin.
 * @param {object} framePatch - Updated frame geometry.
 * @param {object} [options]
 * @param {boolean} [options.round=false] - Round scaled content for persistence.
 * @returns {object} Commit-ready widget update patch.
 */
export function buildResizeUpdate(origin, framePatch, { round = false } = {}) {
  const lockedFramePatch = lockResizeFrame(origin, framePatch, { round })
  const scaleFactor = getResizeScaleFactor(origin, lockedFramePatch.width, lockedFramePatch.height)
  const contentDraft = buildResizeContentDraft(origin, scaleFactor, { round })

  return mergeResizeUpdate(origin.widgetData, lockedFramePatch, contentDraft)
}

/**
 * Builds the same persisted update produced by a ratio-preserving resize
 * handle, with its target width supplied as one Size value.
 *
 * @param {object} widget - Widget definition being resized.
 * @param {number} size - Target frame width in widget coordinates.
 * @returns {object|null} Commit-ready widget update patch, or null for invalid geometry.
 */
export function buildUniformResizeUpdate(widget, size) {
  const origin = captureResizeOrigin(widget)
  const nextWidth = Number(size)

  if (
    !origin ||
    !Number.isFinite(origin.width) ||
    !Number.isFinite(origin.height) ||
    origin.width <= 0 ||
    origin.height <= 0 ||
    !Number.isFinite(nextWidth)
  ) {
    return null
  }

  const framePatch = {
    width: Math.round(nextWidth),
    height: isLeanAngleDisplayType(origin.displayType)
      ? Math.round(nextWidth * LEAN_ANGLE_FRAME_HEIGHT_RATIO)
      : Math.round(origin.height * (nextWidth / origin.width)),
  }

  return buildResizeUpdate(origin, framePatch, { round: true })
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
