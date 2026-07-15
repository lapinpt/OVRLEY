/**
 * Barrel export for the widget-preview feature.
 *
 * Public API — widgets and utilities for SVG preview rendering.
 * Internal modules import directly within the feature.
 */

export { default as WidgetPreview } from './WidgetPreview'
export { buildMetricWidgetPreviewModel } from './widgets/metric/model'
export { buildTextWidgetPreviewModel } from './widgets/text/model'
