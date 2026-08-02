import { useMemo } from 'react'
import { buildMetricWidgetPreviewModel, buildTextWidgetPreviewModel } from '@/features/widget-preview'
import { useFontMetricsEpoch } from '@/features/widget-preview/shared/useFontMetrics'

/**
 * Builds the shared preview models used by the editor canvas, badges, and
 * selection geometry.
 *
 * @param {object} params
 * @param {object[]} params.renderedWidgets - Effective widgets currently shown by the editor.
 * @param {object|null} params.activity - Parsed activity used by metric models.
 * @param {number} params.previewSecond - Canonical preview timestamp.
 * @returns {{ metricPreviewModels: object, textPreviewModels: object }} Models keyed by widget id.
 */
export default function useOverlayPreviewModels({ renderedWidgets, activity, previewSecond }) {
  const fontMetricsEpoch = useFontMetricsEpoch()

  const metricPreviewModels = useMemo(() => {
    void fontMetricsEpoch
    const models = {}
    for (const widget of renderedWidgets) {
      if (widget.category !== 'values') continue

      const model = buildMetricWidgetPreviewModel({ widget, activity, previewSecond })
      if (model) models[widget.id] = model
    }
    return models
  }, [activity, fontMetricsEpoch, previewSecond, renderedWidgets])

  const textPreviewModels = useMemo(() => {
    void fontMetricsEpoch
    const models = {}
    for (const widget of renderedWidgets) {
      if (widget.category !== 'labels') continue

      models[widget.id] = buildTextWidgetPreviewModel({ widget })
    }
    return models
  }, [fontMetricsEpoch, renderedWidgets])

  return { metricPreviewModels, textPreviewModels }
}
