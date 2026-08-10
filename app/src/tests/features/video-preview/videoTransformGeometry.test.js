import { describe, expect, test } from 'vitest'
import { resolveVideoTransformGeometry } from '@/features/video-preview/utils/videoTransformGeometry'

describe('resolveVideoTransformGeometry', () => {
  test('maps an arbitrary crop onto every pixel of a differently-shaped output canvas', () => {
    const source = { width: 2688, height: 1512 }
    const crop = { x: 100, y: 100, width: 2388, height: 1312 }
    const output = { width: 1000, height: 980 }

    const geometry = resolveVideoTransformGeometry({ source, crop, output })
    const scaleX = output.width / crop.width
    const scaleY = output.height / crop.height

    expect(geometry).toEqual({
      width: source.width * scaleX,
      height: source.height * scaleY,
      left: -crop.x * scaleX,
      top: -crop.y * scaleY,
    })
    expect(geometry.left + crop.x * scaleX).toBeCloseTo(0)
    expect(geometry.left + (crop.x + crop.width) * scaleX).toBeCloseTo(output.width)
    expect(geometry.top + crop.y * scaleY).toBeCloseTo(0)
    expect(geometry.top + (crop.y + crop.height) * scaleY).toBeCloseTo(output.height)
  })
})
