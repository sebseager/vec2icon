import { beforeEach, describe, expect, it } from 'vitest'
import { fixture } from '@/core/svg/__fixtures__'
import { useEditor } from '@/state'
import { resetEditor } from '../test-utils'
import { importFiles } from './importFiles'

const file = (name: string, text: string): File => new File([text], name, { type: 'image/svg+xml' })

beforeEach(() => {
  resetEditor()
})

describe('importFiles', () => {
  it('adds the imported groups to the document and selects the first layer', async () => {
    await importFiles(
      [file('background-rect.svg', fixture('background-rect.svg'))],
      useEditor.getState(),
    )

    const doc = useEditor.getState().doc
    expect(doc.groups.length).toBeGreaterThan(0)
    const layers = doc.groups.flatMap((g) => g.layers)
    expect(layers.map((l) => l.name)).toContain('Glyph')
    expect(useEditor.getState().selection.layerIds).toHaveLength(1)
  })

  it('reports one toast per rejected file and imports nothing from it', async () => {
    await importFiles([file('bad-script.svg', fixture('bad-script.svg'))], useEditor.getState())

    const toasts = useEditor.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.message).toMatch(/^Rejected bad-script\.svg: .+/)
    expect(useEditor.getState().doc.groups).toHaveLength(0)
  })

  it('toasts a file the browser cannot read and still imports the others', async () => {
    const unreadable = file('gone.svg', '')
    Object.defineProperty(unreadable, 'arrayBuffer', {
      value: () => Promise.reject(new Error('NotFoundError')),
    })

    await importFiles(
      [unreadable, file('background-rect.svg', fixture('background-rect.svg'))],
      useEditor.getState(),
    )

    const toasts = useEditor.getState().toasts
    expect(toasts.map((t) => t.message)).toContain('Could not read gone.svg: NotFoundError')
    expect(useEditor.getState().doc.groups.length).toBeGreaterThan(0)
  })

  it('ignores an empty file list', async () => {
    await importFiles([], useEditor.getState())
    expect(useEditor.getState().doc.groups).toHaveLength(0)
    expect(useEditor.getState().toasts).toHaveLength(0)
  })
})
