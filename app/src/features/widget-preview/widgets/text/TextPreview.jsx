/**
 * Renders the overlay text/label widget SVG preview — renders widget text
 * with font, color, opacity, shadow, and border styling.
 *
 * All data is received via props; no store access.
 *
 * @param {object} props
 * @param {object} props.widget - Widget configuration object.
 * @param {number} props.globalOpacity - Global opacity multiplier.
 * @param {object} props.sceneStyle - Scene style object (shadow, border).
 * @param {object|null} props.textPreviewModel - Precomputed text preview model (optional).
 * @returns {JSX.Element} SVG element for text widget preview.
 */

import { buildTextWidgetPreviewModel } from './model'
import { getPreviewFontFamily, getWidgetOpacity } from '../../shared/textMeasurement'
import { getTextShadowParts } from '../../shared/shadow'
import { PreviewSvgText } from '../../shared/PreviewSvgComponents'
import { sanitizeSvgId } from '../../shared/svgPreviewUtils'
import { useFontMetricsVersion } from '../../shared/useFontMetrics'

export function OverlayTextWidget({ widget, globalOpacity, sceneStyle, textPreviewModel }) {
  const fontSize = widget.data.font_size
  const fontFamily = getPreviewFontFamily(widget.data.font)
  useFontMetricsVersion(fontFamily, fontSize)
  const opacity = getWidgetOpacity(widget.data, globalOpacity)
  const shadow = getTextShadowParts(sceneStyle)
  const previewModel = textPreviewModel ?? buildTextWidgetPreviewModel({ widget })
  const visualBounds = previewModel.visualBounds

  return (
    <svg
      width={visualBounds.width}
      height={visualBounds.height}
      viewBox={`0 0 ${visualBounds.width} ${visualBounds.height}`}
      className="block overflow-visible"
    >
      <PreviewSvgText
        text={previewModel.text}
        x={visualBounds.offsetX}
        baseline={previewModel.baseline + visualBounds.offsetY}
        color={widget.data.color}
        fontFamily={fontFamily}
        fontSize={fontSize}
        opacity={opacity}
        shadow={shadow}
        shadowFilterId={sanitizeSvgId(`${widget.id}-label-shadow`)}
        borderColor={sceneStyle?.border_color}
        borderThickness={sceneStyle?.border_thickness}
        textTransform="none"
      />
    </svg>
  )
}
