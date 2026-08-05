import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { prepareGForcePreview } from '@/features/widget-preview/widgets/g-force/model'

describe('G-force preview model', () => {
  test('derives the Rust fixture scale with the same nearest-rank convention', async () => {
    const fixturePath = path.resolve('../src-tauri/ovrley_core/tests/fixtures/g-force-frame-state.json')
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))

    expect(prepareGForcePreview(fixture.activity, fixture.config).maxG).toBe(fixture.expected_max_g)
  })
})
