import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, test, vi, beforeEach } from 'vitest'

const finalizeActivity = vi.hoisted(() => vi.fn())

vi.mock('@/api/backend', () => ({
  finalizeActivity,
  writeParseDebugFile: vi.fn().mockResolvedValue('debug-path.json'),
  openVideo: vi.fn(),
}))

const fixtureDir = path.resolve('../src-tauri/ovrley_core/tests/fixtures/activity')

function storeActions() {
  return {
    activateActivityFile: vi.fn(),
    clearActivitySummary: vi.fn(),
    setActivityFilename: vi.fn(),
    setEndSecond: vi.fn(),
    setFallbackDurationSeconds: vi.fn(),
    setSelectedSecond: vi.fn(),
    setStartSecond: vi.fn(),
  }
}

describe('import-activity store boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    finalizeActivity.mockReset()
    finalizeActivity.mockResolvedValue({
      parsed_activity: {
        metadata: {
          duration_seconds: 0,
        },
      },
    })
  })

  test('saveFile is callable with optional store actions parameter', async () => {
    const { default: saveFile } = await import('@/lib/activity/import-activity')
    expect(typeof saveFile).toBe('function')
    expect(saveFile.length).toBe(2) // fileOrPath + optional storeActions
  })

  test('imports IGC files through the shared finalizer boundary', async () => {
    const { default: saveFile } = await import('@/lib/activity/import-activity')
    const text = await readFile(path.join(fixtureDir, '654G6NG1.IGC'), 'utf8')
    const file = new File([text], '654G6NG1.IGC')
    const store = storeActions()

    await saveFile(file, store)

    expect(finalizeActivity).toHaveBeenCalledTimes(1)
    const rawActivity = finalizeActivity.mock.calls[0][0]
    expect(rawActivity.file_name).toBe('654G6NG1.IGC')
    expect(rawActivity.file_format).toBe('igc')
    expect(rawActivity.raw_samples.length).toBeGreaterThan(0)
    expect(store.setActivityFilename).toHaveBeenCalledWith('654G6NG1.IGC')
    expect(store.activateActivityFile).toHaveBeenCalledWith({
      metadata: {
        duration_seconds: 0,
      },
    })
  })
})
