import { buildWidgetTransform } from '@/lib/geometryUtils'
import { isFramedWidget } from '@/lib/widget/display-type-behavior'
import { getLeanAngleSelectionFrame } from '@/lib/widget/lean-angle-geometry'
import { getWidgetSceneOrigin } from './overlayEditorHelpers'

function buildScaleTranslate(tx, ty) {
  if (!tx && !ty) {
    return ''
  }

  return `translate(${tx}px, ${ty}px)`
}

export function resolveWidgetRenderGeometry(widget, visualBounds, globalScale, preview = null) {
  const isFramed = isFramedWidget(widget)
  const scaleFactor = preview?.scaleFactor
  const isScaling = Number.isFinite(scaleFactor)
  const rotation = widget.type === 'course' ? (widget.data.rotation ?? 0) : 0
  const resolvedData = widget.data
  const displayScale = globalScale || 1
  const leanSelectionFrame =
    resolvedData.display_type === 'lean_angle'
      ? getLeanAngleSelectionFrame({
          diameter: resolvedData.diameter,
          track_thickness: resolvedData.track_thickness,
          font_size: resolvedData.font_size,
          value_offset_y: resolvedData.value_offset_y,
        })
      : null
  const frameWidth = (leanSelectionFrame?.width ?? resolvedData.width ?? 0) * displayScale
  const frameHeight = (leanSelectionFrame?.height ?? resolvedData.height ?? 0) * displayScale
  const staticOrigin = getWidgetSceneOrigin(widget, null, visualBounds, {
    boundsScale: isFramed ? 1 : globalScale,
  })

  const left = isScaling ? (preview.left ?? staticOrigin.x) : staticOrigin.x
  const top = isScaling ? (preview.top ?? staticOrigin.y) : staticOrigin.y
  const width = isScaling ? preview.width : isFramed ? frameWidth : (visualBounds?.width ?? widget.data.width)
  const height = isScaling ? preview.height : isFramed ? frameHeight : (visualBounds?.height ?? widget.data.height)
  const translateX = isScaling ? (preview.translateX ?? 0) : 0
  const translateY = isScaling ? (preview.translateY ?? 0) : 0
  const scale = isScaling ? globalScale * scaleFactor : isFramed ? 1 : globalScale
  const transformParts = []
  const translate = buildScaleTranslate(translateX, translateY)

  if (translate) {
    transformParts.push(translate)
  }

  const baseTransform = buildWidgetTransform({ scale, rotation })
  if (baseTransform) {
    transformParts.push(baseTransform)
  }

  return {
    badgeLeft: left + translateX,
    badgeTop: top + translateY,
    height,
    isScaling,
    left,
    top,
    transform: transformParts.join(' '),
    translateX,
    translateY,
    width,
  }
}

export function buildRenderedGeometrySignature(widget, visualBounds, globalScale, preview = null) {
  if (!widget) {
    return 'none'
  }

  const renderGeometry = resolveWidgetRenderGeometry(widget, visualBounds, globalScale, preview)

  return JSON.stringify({
    id: widget.id,
    left: renderGeometry.left,
    top: renderGeometry.top,
    width: renderGeometry.width ?? null,
    height: renderGeometry.height ?? null,
    transform: renderGeometry.transform,
    minX: visualBounds?.minX ?? null,
    minY: visualBounds?.minY ?? null,
    maxX: visualBounds?.maxX ?? null,
    maxY: visualBounds?.maxY ?? null,
  })
}
