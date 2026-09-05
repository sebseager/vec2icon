import { beforeEach, describe, expect, it } from 'vitest'
import { importSvgFiles } from '@/core/svg'
import { fixture } from '@/core/svg/__fixtures__'
import { useEditor } from '@/state'
import { resetEditor } from '../test-utils'
import { applyIssueFix, applyIssueFixToAll, FIX_ALL_CODES } from './applyFix'

const importFixture = async (name: string): Promise<void> => {
  const result = await importSvgFiles([{ name, data: fixture(name) }])
  useEditor.getState().importGroups(result.groups)
}

beforeEach(() => {
  resetEditor()
})

describe('applyIssueFix', () => {
  it('turns a background layer into the document fill and deletes the layer', async () => {
    await importFixture('background-rect.svg')
    const before = useEditor.getState().doc
    const layers = before.groups.flatMap((g) => g.layers)
    const background = layers.find((l) => l.issues.some((i) => i.code === 'background'))
    expect(background).toBeDefined()

    applyIssueFix(useEditor.getState(), background as never, 'background', 'to-fill')

    const after = useEditor.getState().doc
    expect(after.groups.flatMap((g) => g.layers).some((l) => l.id === background?.id)).toBe(false)
    expect(after.fill.default).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [0.0392, 0.5176, 1, 1] },
    })
  })

  it('rewrites the layer in place for a fix that keeps it', async () => {
    await importFixture('filter-mask.svg')
    const layer = useEditor
      .getState()
      .doc.groups.flatMap((g) => g.layers)
      .find((l) => l.issues.some((i) => i.code === 'filter'))
    expect(layer).toBeDefined()

    applyIssueFix(useEditor.getState(), layer as never, 'filter', 'remove-filters')

    const after = useEditor
      .getState()
      .doc.groups.flatMap((g) => g.layers)
      .find((l) => l.id === layer?.id)
    expect(after).toBeDefined()
    expect(after?.issues.some((i) => i.code === 'filter')).toBe(false)
  })
})

describe('applyIssueFixToAll', () => {
  it('offers apply-to-all only for the repeatable codes', () => {
    expect(FIX_ALL_CODES).toEqual(['filter', 'mask', 'raster'])
  })

  it('fixes every layer carrying the code', async () => {
    await importFixture('filter-mask.svg')
    applyIssueFixToAll(useEditor.getState(), 'mask', 'remove-masks')
    const layers = useEditor.getState().doc.groups.flatMap((g) => g.layers)
    expect(layers.length).toBeGreaterThan(0)
    expect(layers.some((l) => l.issues.some((i) => i.code === 'mask'))).toBe(false)
  })

  it('takes one undo step however many layers it touches', async () => {
    const result = await importSvgFiles([
      { name: 'one.svg', data: fixture('filter-mask.svg') },
      { name: 'two.svg', data: fixture('filter-mask.svg') },
    ])
    useEditor.getState().importGroups(result.groups)
    const affected = useEditor
      .getState()
      .doc.groups.flatMap((g) => g.layers)
      .filter((l) => l.issues.some((i) => i.code === 'mask'))
    expect(affected.length).toBeGreaterThan(1)

    const before = useEditor.temporal.getState().pastStates.length
    applyIssueFixToAll(useEditor.getState(), 'mask', 'remove-masks')
    expect(useEditor.temporal.getState().pastStates.length).toBe(before + 1)

    useEditor.getState().undo()
    const restored = useEditor.getState().doc.groups.flatMap((g) => g.layers)
    expect(restored.filter((l) => l.issues.some((i) => i.code === 'mask'))).toHaveLength(
      affected.length,
    )
  })
})
