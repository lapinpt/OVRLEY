export function resolveVideoTransformGeometry({ source, crop, output }) {
  if (!source || !crop || !output) return null
  const values = [source.width, source.height, crop.x, crop.y, crop.width, crop.height, output.width, output.height]
  if (!values.every(Number.isFinite) || crop.width <= 0 || crop.height <= 0 || output.width <= 0 || output.height <= 0) return null
  const scaleX = output.width / crop.width
  const scaleY = output.height / crop.height
  return { width: source.width * scaleX, height: source.height * scaleY, left: -crop.x * scaleX, top: -crop.y * scaleY }
}

export function fullFrameCrop(source) {
  return source ? { x: 0, y: 0, width: source.width, height: source.height } : null
}
