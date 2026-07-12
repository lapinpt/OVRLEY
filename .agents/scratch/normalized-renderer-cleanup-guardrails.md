# Normalized Renderer Cleanup Guardrails

This document is an instruction set for LLMs cleaning renderer and layout code in this repository.

The central rule is simple:

> Once a template has crossed the normalization boundary, renderer code consumes the normalized contract directly. It does not re-validate, repair, reinterpret, rename, or sanitize that data.

The renderer is allowed to implement rendering behavior. It is not allowed to become a second schema, a second normalizer, or an adapter layer between two inconsistent APIs.

## 1. Treat normalized data as a strict contract

Normalization happens when templates are loaded. Validation and default materialization belong there. Renderers receive the resulting shape and may assume that required fields exist and have the documented types.

Wrong:

```js
const width = data.width ?? 200
const height = Number.isFinite(data.height) ? data.height : 60
const opacity = typeof data.opacity === 'number' ? data.opacity : 1
const showLabels = Boolean(data.show_min_max_labels)
```

Good:

```js
const opacity = data.opacity * globalOpacity
{data.show_min_max_labels ? <Labels /> : null}
<svg width={data.width * globalScale} height={data.height * globalScale} />
```

If a required field is missing, the renderer should fail at the access or calculation that needs it. A loud failure exposes a broken normalization path. A fallback hides it and produces an invalid or misleading preview.

Do not add any of these to a normalized renderer:

- `|| defaultValue` for required fields
- `?? defaultValue` for required fields
- default values in component props for required render inputs
- `typeof`, `Array.isArray`, `Number.isFinite`, or similar schema checks
- `Boolean(value)` to coerce a field that the schema already defines as boolean
- `Number(value)`, `parseInt`, or `parseFloat` to repair normalized numbers
- `Number.isInteger` or numeric validity checks used as defensive formatting branches
- `if (!model) return null` when the caller contract guarantees the model
- `if (!path) return null` when valid geometry is guaranteed

The correct fix for a missing or malformed field is in the normalizer/schema, not in every consumer.

## 2. Separate behavior branches from validation branches

Not every conditional is bad. A renderer must branch when the visual output genuinely differs.

Allowed:

```jsx
{data.show_min_max_labels ? <Labels /> : null}
{innerLayout.unit ? <UnitText /> : null}
{data.display_type === 'corner' ? <CornerPresentation /> : <ArcPresentation />}
```

These conditions select documented rendering behavior.

Disallowed:

```jsx
if (data.display_type !== 'arc' && data.display_type !== 'corner') return null
if (!innerModel) return null
if (!d) return null
```

Those checks turn an invalid state into a silent empty render. Dispatch and normalization already guarantee that the renderer receives a supported display type, a model, and valid geometry. Let an invalid state fail loudly.

Do not confuse an optional visual element with an optional input contract. A unit can be absent because the normalized model intentionally has no unit. A required widget model cannot be absent.

## 3. Do not create aliases for direct fields

A direct field alias creates a second name without adding meaning. It makes it harder to see which schema field is being consumed and encourages stale naming schemes.

Wrong:

```js
const width = data.width
const height = data.height
const scale = globalScale
const trackThickness = data.track_thickness
const borderThickness = data.track_border_thickness
```

Good:

```jsx
<svg
  width={data.width * globalScale}
  height={data.height * globalScale}
  viewBox={`0 0 ${data.width} ${data.height}`}
>
```

The same rule applies to IDs and direct strings.

Wrong:

```js
const shadowFilterId = `${prefix}-${widget.id}-shadow`
const borderMaskId = `${prefix}-${widget.id}-border-mask`
```

Good:

```jsx
<PreviewSvgShadowBlurFilter id={`${data.display_type}-gauge-${widget.id}-shadow`} shadow={shadow} />
<mask id={`${data.display_type}-gauge-${widget.id}-border-mask`}>
```

A local is justified only when it is a genuinely derived value or a reusable computed model, for example `opacity`, `layout`, `fillReveal`, or a label-position model. Do not rename a schema field merely to shorten it.

## 4. Eliminate field-by-field object adapters

An object literal that translates one vocabulary into another is an adapter. In renderer code it usually means the underlying API is shaped incorrectly.

Wrong:

```js
getCornerGaugeLayout({
  value,
  values: activity[data.value],
  width: data.width,
  height: data.height,
  cornerOrientation: data.corner_orientation,
  trackThickness: data.track_thickness,
  trackCornerRadius: data.track_corner_radius,
  borderThickness: data.track_border_thickness,
})
```

This creates a camelCase geometry vocabulary solely at the call site.

Good:

```js
getCornerGaugeLayout(data, value, activity[data.value])
```

The underlying layout API must accept normalized data directly and receive runtime values through explicit, stable arguments:

```js
export function getCornerGaugeLayout(data, value, values) {
  const frameSize = Math.min(data.width, data.height)
  const thickness = data.track_thickness
  const orientation = data.corner_orientation
  // build geometry from the canonical data fields
}
```

Do not “solve” an API mismatch by adding another mapper in the renderer. Change the underlying API once.

Do not spread data into an incompatible API and then patch the missing fields:

```js
// Still an adapter. The spread only hides the mismatch.
getArcGaugeLayout({ ...data, arcAngle: data.arc_angle, trackThickness: data.track_thickness })
```

## 5. Do not remap layout geometry into path geometry

When a layout already contains the geometry fields required by a path builder, pass the layout through directly.

Wrong:

```js
const trackPath = getArcFilledTrackPath({
  centerX: layout.centerX,
  centerY: layout.centerY,
  radius: layout.radius,
  startAngle: layout.startAngle,
  sweepAngle: layout.sweepAngle,
  trackThickness: layout.trackThickness,
  cornerRadius,
})
```

Good:

```jsx
<ArcTrackPath {...layout} cornerRadius={data.track_corner_radius} fill={data.track_empty_color} fillOpacity={opacity} />
```

The path component can forward the geometry object directly:

```js
function ArcTrackPath({ fill, fillOpacity, mask, dataTestId, ...geometry }) {
  const path = <path data-testid={dataTestId} d={getArcFilledTrackPath(geometry)} fill={fill} fillOpacity={fillOpacity} />
  return mask ? <g mask={mask}>{path}</g> : path
}
```

An intentional geometry override is acceptable when it changes the geometry, such as replacing `trackThickness` with `layout.outerStrokeWidth` for the border. That is a derived rendering operation, not a field rename. Keep the override at the point where the visual variation is rendered.

## 6. Do not make APIs accept function calls as positional measurement arguments

A layout API that requires the renderer to pass a chain of measurement calls is a toxic boundary. It forces the caller to know the helper’s internal preparation sequence and makes the call unreadable.

Wrong:

```js
getArcInnerWidgetLayout(
  data,
  layout,
  innerModel,
  measureArcPreviewText(innerModel.valueText, innerModel.fontSize, innerModel.fontFamily),
  measureArcPreviewText(verticalText, innerModel.fontSize, innerModel.fontFamily),
  innerModel.unitText ? measureArcPreviewText(unitText, unitSize, innerModel.fontFamily) : null,
)
```

Good:

```js
const innerModel = buildArcGaugeInnerWidgetModel({ widget, activity, previewSecond })
const innerLayout = getArcInnerWidgetLayout(data, layout, innerModel)
```

The owner of the model prepares its measurements once:

```js
return {
  valueText,
  unitText,
  fontFamily,
  fontSize,
  valueMeasure,
  valueVerticalMeasure,
  unitMeasure,
}
```

The layout helper consumes the prepared model. Do not pass callbacks or measurement-producing functions into a pure layout helper merely to avoid fixing the model boundary.

## 7. Keep preparation in the owning layer

Formatting and text measurement belong to the preview model builder. Geometry belongs to the geometry helper. SVG assembly belongs to the renderer.

Wrong:

```jsx
const innerLayout = getArcInnerWidgetLayout({
  valueMeasure: measurePreviewText(...),
  valueVerticalMeasure: resolveVerticalMetrics(...),
  unitMeasure: unitText ? measurePreviewText(...) : null,
})
```

Good:

```js
const innerModel = buildArcGaugeInnerWidgetModel(...)
const innerLayout = getArcInnerWidgetLayout(data, layout, innerModel)
```

Do not duplicate preparation in multiple renderers. If a value needs a formatting correction, add it to the model that owns that value.

## 8. Do not sanitize IDs when the contract defines IDs

Widget IDs are normalized and stable. Adding a generated ID fallback and an SVG sanitizer creates a second identity system and masks invalid identity data.

Wrong:

```js
const generatedId = useId()
const id = sanitizeSvgId(`arc-${widget.id || generatedId}-shadow`)
```

Good:

```jsx
<filter id={`${data.display_type}-gauge-${widget.id}-shadow`}>
```

If an ID is invalid, fix ID normalization or identity generation. Do not silently replace it in an individual renderer.

## 9. Do not normalize colors or opacity again in a normalized renderer

Color normalization, alpha expansion, and opacity validation belong before rendering. The renderer should use the normalized color and the explicit opacity multiplier.

Wrong:

```js
const shadowColor = shadow ? normalizeSvgShadowColor(shadow.color, opacity) : null
<path fill={shadowColor.color} fillOpacity={shadowColor.opacity} />
```

Good:

```jsx
<ArcTrackPath fill={shadow.color} fillOpacity={opacity} />
```

Do not add “safe color,” “safe opacity,” or legacy color-format branches to a consumer that receives normalized fields.

## 10. Do not use fallback anchors for valid geometry variants

If a geometry variant has a different anchor, the geometry helper must return that anchor. The renderer must select the documented variant directly.

Wrong:

```js
const innerAnchor = layout.innerAnchor ?? { x: layout.centerX, y: layout.centerY }
```

Good:

```js
const innerLayout = getArcInnerWidgetLayout(data, layout, innerModel)
```

The underlying layout helper owns the arc-versus-corner anchor rule. Do not recreate it with nullish fallback logic in the renderer.

## 11. Do not add numeric display checks to hide contract problems

Normalized ranges are numbers. Do not branch on integer-ness or repair number formatting in the renderer just because a value might be malformed.

Wrong:

```js
const label = Number.isInteger(layout.min) ? `${layout.min}` : layout.min.toFixed(1)
```

Good:

```js
const minLabel = `${layout.min}`
const maxLabel = `${layout.max}`
```

If the product needs a specific label format, make formatting an explicit shared formatting function with a documented contract. Do not use `Number.isInteger` as a defensive branch inside one renderer.

## 12. Separate independent hooks are not duplicate aliases

Two hook calls are valid when they subscribe to two independent inputs. In the arc renderer, value text and min/max labels may use different font families and sizes.

Valid:

```js
useFontMetricsVersion(valueFontFamily, data.font_size)
useFontMetricsVersion(labelFontFamily, data.min_max_label_font_size)
```

These calls are not remappings and must not be collapsed by removing one subscription. The hook tracks one font/size pair per call; removing one leaves one set of Canvas metrics stale after font loading.

Do not combine independent hooks merely to reduce line count. Only create a multi-input hook if the underlying hook API is intentionally redesigned and its contract remains clearer.

## 13. Document every function

Every function introduced or modified during cleanup must have a concise JSDoc comment. The comment must state what the function does, its inputs, and its return value when those are not obvious from the signature.

Minimum acceptable:

```js
/** Returns the SVG baseline that centers a measured glyph around a y-coordinate. */
function centeredTextBaseline(measurement, centerY) {
  return centerY + (measurement.ascent - measurement.descent) * 0.5
}
```

For public helpers and component exports, include `@param` and `@returns` entries:

```js
/**
 * Produces an arc layout from normalized data and runtime metric values.
 * @param {object} data - Normalized arc-gauge data.
 * @param {number|null} value - Current metric value.
 * @param {number[]} values - Metric samples.
 * @returns {object} Arc geometry.
 */
export function getArcGaugeLayout(data, value, values) {
  // ...
}
```

Do not write comments that merely restate implementation line by line. Document the contract and ownership boundary.

## 14. Strict review checklist for an LLM

Before declaring a normalized renderer cleanup complete, verify all of the following:

1. No required data field is read through `||`, `??`, optional chaining, or a default parameter.
2. No required field is checked with `typeof`, `Array.isArray`, `Number.isFinite`, `Number.isInteger`, or `Boolean()` in the renderer.
3. No invalid state is converted into `null`, an empty path, a generated ID, or a default visual.
4. No direct field aliases exist for width, height, scale, opacity, font size, thickness, colors, or IDs.
5. No field-by-field adapter object translates normalized snake_case data into another renderer vocabulary.
6. Underlying APIs consume canonical data directly; fix those APIs instead of adding a renderer adapter.
7. Layout helpers do not receive nested function calls or callbacks for work that belongs in the model builder.
8. Path helpers consume spread layout geometry rather than remapped coordinate objects.
9. IDs are deterministic and direct; no sanitization or generated fallback is present.
10. Color and opacity normalization is not repeated in the renderer.
11. Intentional visual branches remain: display variant, optional labels, optional unit, border, shadow, and fill reveal.
12. Every modified function is documented.
13. Focused renderer and geometry tests pass.
14. Formatter, linter, and `git diff --check` pass.
15. Only files required by the API correction and its tests are changed.

If any checklist item fails, the cleanup is incomplete.
