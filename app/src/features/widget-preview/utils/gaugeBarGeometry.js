/** Pure segmented-track geometry shared by gauge previews and editors. */

const MIN_BAR_PX = 2

const MIN_SUGGESTED_GAP_PX = 2
const MAX_SUGGESTED_GAP_PX = 6
const MIN_TARGET_BAR_PX = 8
const MAX_TARGET_BAR_PX = 24

export function getBarFillCount(fill01, count) {
  return Math.floor(Math.min(1, Math.max(0, fill01)) * count)
}

function validateBarCount(span, bar_count) {
  if (span < MIN_BAR_PX) throw new Error(`Track span must be at least ${MIN_BAR_PX}px`)
  if (!Number.isInteger(bar_count) || bar_count < 1) throw new Error('bar_count must be an integer >= 1')

  const maxCount = Math.floor(span / MIN_BAR_PX)
  if (bar_count > maxCount) throw new Error(`${bar_count} bars do not fit in ${span}px`)
}

function getExactBarGapMax(span, bar_count) {
  return bar_count === 1 ? 0 : (span - bar_count * MIN_BAR_PX) / (bar_count - 1)
}

function getBarGapMax({ span, bar_count }) {
  validateBarCount(span, bar_count)
  return Math.floor(getExactBarGapMax(span, bar_count))
}

export function getBarGeometry({ span, bar_count, bar_gap }) {
  validateBarCount(span, bar_count)
  if (bar_gap < 0) throw new Error('bar_gap must be >= 0')

  if (bar_count === 1) return { count: bar_count, gap: 0, extent: span }

  const maxGap = getExactBarGapMax(span, bar_count)
  const gap = Math.min(bar_gap, maxGap)
  return {
    count: bar_count,
    gap,
    extent: (span - (bar_count - 1) * gap) / bar_count,
  }
}

function getCornerRadiusMax(crossExtent, alongExtent) {
  return Math.floor(Math.min(crossExtent, alongExtent) * 0.5)
}

function getSuggestedBarGeometry({ span, outerThickness, crossExtent }) {
  const bar_gap = Math.round(Math.min(MAX_SUGGESTED_GAP_PX, Math.max(MIN_SUGGESTED_GAP_PX, outerThickness * 0.2)))
  const targetExtent = Math.round(Math.min(MAX_TARGET_BAR_PX, Math.max(MIN_TARGET_BAR_PX, outerThickness)))
  const maxCount = Math.floor(span / MIN_BAR_PX)
  const proposedCount = Math.round((span + bar_gap) / (targetExtent + bar_gap))
  const bar_count = Math.min(maxCount, Math.max(maxCount >= 3 ? 3 : 1, proposedCount))
  const maxGap = getBarGapMax({ span, bar_count })
  const gap = Math.min(bar_gap, maxGap)
  const geometry = getBarGeometry({ span, bar_count, bar_gap: gap })
  return { count: bar_count, gap, maxGap, cornerRadiusMax: getCornerRadiusMax(crossExtent, geometry.extent) }
}

export function getLinearBarGeometry({ width, height, orientation, bar_count, bar_gap }) {
  const horizontal = orientation === 'horizontal'
  const span = horizontal ? width : height
  return {
    ...getBarGeometry({
      span,
      bar_count,
      bar_gap,
    }),
    span,
  }
}

export function getSuggestedLinearBarGeometry({ width, height, orientation }) {
  const horizontal = orientation === 'horizontal'
  return getSuggestedBarGeometry({
    span: horizontal ? width : height,
    outerThickness: horizontal ? height : width,
    crossExtent: horizontal ? height : width,
  })
}

export function getLinearTrackCornerRadiusMax(data) {
  const horizontal = data.orientation === 'horizontal'
  const crossExtent = horizontal ? data.height : data.width
  const alongExtent = data.track_fill_style === 'bars' ? getLinearBarGeometry(data).extent : horizontal ? data.width : data.height
  return getCornerRadiusMax(crossExtent, alongExtent)
}

export function getLinearBarGapMax({ width, height, orientation, bar_count }) {
  return getBarGapMax({ span: orientation === 'horizontal' ? width : height, bar_count })
}

export function getLinearBarRects(config) {
  const { width, height, orientation } = config
  const horizontal = orientation === 'horizontal'
  const geometry = getLinearBarGeometry(config)
  const rects = []
  for (let index = 0; index < geometry.count; index += 1) {
    rects.push(
      horizontal
        ? { x: index * (geometry.extent + geometry.gap), y: 0, width: geometry.extent, height }
        : { x: 0, y: height - geometry.extent - index * (geometry.extent + geometry.gap), width, height: geometry.extent },
    )
  }
  return { ...geometry, rects }
}

export function getSuggestedArcBarGeometry({ radius, sweepAngle, trackThickness, borderThickness }) {
  return getSuggestedBarGeometry({
    span: Math.abs((sweepAngle * Math.PI * radius) / 180),
    outerThickness: trackThickness + borderThickness * 2,
    crossExtent: trackThickness,
  })
}

export function getArcTrackCornerRadiusMax(data) {
  const alongExtent = data.track_fill_style === 'bars' ? getArcBarGeometry(data).extent : data.trackThickness
  return getCornerRadiusMax(data.trackThickness, alongExtent)
}

export function getArcBarGapMax({ radius, sweepAngle, bar_count }) {
  return getBarGapMax({ span: Math.abs((sweepAngle * Math.PI * radius) / 180), bar_count })
}

export function getArcBarGeometry({ radius, sweepAngle, bar_count, bar_gap }) {
  const span = Math.abs((sweepAngle * Math.PI * radius) / 180)
  return {
    ...getBarGeometry({
      span,
      bar_count,
      bar_gap,
    }),
    span,
  }
}

export function getArcBarSegments(config) {
  const { radius, startAngle, sweepAngle, borderThickness, cornerRadius } = config
  const direction = Math.sign(sweepAngle)
  const geometry = getArcBarGeometry(config)
  const capExtent = Math.min(cornerRadius + borderThickness, geometry.extent * 0.5)
  const segments = []
  for (let index = 0; index < geometry.count; index += 1) {
    const bodyStart = index * (geometry.extent + geometry.gap) + capExtent
    const bodyExtent = Math.max(0.001, geometry.extent - capExtent * 2)
    segments.push({
      startAngle: startAngle + (direction * ((bodyStart / radius) * 180)) / Math.PI,
      sweepAngle: (direction * ((bodyExtent / radius) * 180)) / Math.PI,
    })
  }
  return { ...geometry, segments }
}
