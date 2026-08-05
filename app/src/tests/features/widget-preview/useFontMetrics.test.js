import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useFontMetrics } from '@/features/widget-preview/shared/useFontMetrics'

describe('useFontMetrics', () => {
  let originalFonts
  let fonts

  beforeEach(() => {
    originalFonts = document.fonts
    fonts = {
      load: vi.fn(() => Promise.resolve()),
      ready: Promise.resolve(),
    }
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
  })

  afterEach(() => {
    if (originalFonts === undefined) {
      delete document.fonts
      return
    }

    Object.defineProperty(document, 'fonts', { configurable: true, value: originalFonts })
  })

  test('loads the requested fonts and reuses the same request set', async () => {
    const initialRequests = [
      { fontFamily: 'Arial', fontSize: 30 },
      { fontFamily: 'Evogria', fontSize: 18 },
    ]
    const { result, rerender } = renderHook(({ requests }) => useFontMetrics(requests), {
      initialProps: { requests: initialRequests },
    })

    await waitFor(() => expect(result.current).toBe(1))
    expect(fonts.load).toHaveBeenCalledTimes(2)

    rerender({ requests: initialRequests.map((request) => ({ ...request })) })
    expect(fonts.load).toHaveBeenCalledTimes(2)
  })
})
