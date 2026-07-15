/**
 * Shadow utilities — text shadow and outline shadow computation that mirrors
 * the Skia renderer's shadow behavior.
 */

/**
 * Extracts the text shadow configuration from scene data.
 *
 * Mirrors the Skia renderer's shadow parameter extraction — reads shadow_strength,
 * shadow_distance, and shadow_color from the data object.
 *
 * @param {object|null|undefined} data - Scene or style data with shadow properties.
 * @returns {{ color: string, distance: number, strength: number }|undefined} Shadow config, or undefined if no shadow.
 */
export function getTextShadowParts(data) {
  if (!data?.shadow_color || (data.shadow_strength ?? 0) <= 0) return undefined

  return {
    color: data.shadow_color,
    distance: data.shadow_distance ?? 0,
    strength: data.shadow_strength,
  }
}
