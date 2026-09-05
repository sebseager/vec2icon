import { beforeEach, describe, expect, it } from 'vitest'
import { createGroup, createLayer, emptyDoc } from '../core/model/defaults'
import type { BBox, Group, IconDoc, Layer, ViewBox } from '../core/model/types'
import { handleEditorKey } from './keyboard'
import { useEditor } from './store'

const SVG = '<g><rect width="10" height="10"/></g>'
const VB: ViewBox = [0, 0, 100, 100]
const BBOX: BBox = { x: 0, y: 0, width: 10, height: 10 }

const layer = (name: string): Layer =>
  createLayer({ name, svg: SVG, defs: '', sourceViewBox: VB, bbox: BBOX })

const initialDoc = (): IconDoc => {
  const a = layer('A')
  const b = layer('B')
  return { ...emptyDoc(), groups: [createGroup('G1', [a, b])] }
}

const key = (
  k: string,
  opts: Partial<{
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    target: EventTarget | null
    defaultPrevented: boolean
  }> = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  target: null,
  defaultPrevented: false,
  ...opts,
})

beforeEach(() => {
  useEditor.setState({
    doc: initialDoc(),
    selection: { layerIds: [], groupId: null },
    toasts: [],
  })
  useEditor.temporal.getState().clear()
  useEditor.temporal.getState().resume()
})

describe('handleEditorKey', () => {
  it('ignores events targeting an input element', () => {
    const input = document.createElement('input')
    const handled = handleEditorKey(
      key('z', { metaKey: true, target: input }),
      useEditor.getState(),
    )
    expect(handled).toBe(false)
  })

  it('ignores events targeting a select element', () => {
    const select = document.createElement('select')
    const handled = handleEditorKey(key('ArrowDown', { target: select }), useEditor.getState())
    expect(handled).toBe(false)
  })

  it('ignores events a focused widget has already handled', () => {
    const handled = handleEditorKey(
      key('z', { metaKey: true, defaultPrevented: true }),
      useEditor.getState(),
    )
    expect(handled).toBe(false)
  })

  it('ignores events inside a listbox, tab strip or sortable handle', () => {
    for (const attribute of [
      'role="listbox"',
      'role="tablist"',
      'role="menu"',
      'role="dialog"',
      'aria-roledescription="sortable"',
    ]) {
      const host = document.createElement('div')
      host.innerHTML = `<div ${attribute}><button type="button">x</button></div>`
      const button = host.querySelector('button') as HTMLElement
      expect(handleEditorKey(key('ArrowDown', { target: button }), useEditor.getState())).toBe(
        false,
      )
    }
  })

  it('ignores events targeting a contentEditable element', () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    const handled = handleEditorKey(key('z', { metaKey: true, target: div }), useEditor.getState())
    expect(handled).toBe(false)
  })

  it('Cmd/Ctrl+Z undoes', () => {
    useEditor.getState().renameDoc('Renamed')
    const handled = handleEditorKey(key('z', { metaKey: true }), useEditor.getState())
    expect(handled).toBe(true)
    expect(useEditor.getState().doc.name).not.toBe('Renamed')
  })

  it('Shift+Cmd/Ctrl+Z redoes', () => {
    useEditor.getState().renameDoc('Renamed')
    useEditor.getState().undo()
    const handled = handleEditorKey(
      key('z', { metaKey: true, shiftKey: true }),
      useEditor.getState(),
    )
    expect(handled).toBe(true)
    expect(useEditor.getState().doc.name).toBe('Renamed')
  })

  it('Ctrl+Y redoes', () => {
    useEditor.getState().renameDoc('Renamed')
    useEditor.getState().undo()
    const handled = handleEditorKey(key('y', { ctrlKey: true }), useEditor.getState())
    expect(handled).toBe(true)
    expect(useEditor.getState().doc.name).toBe('Renamed')
  })

  it('Delete removes selected layers', () => {
    const [a] = (useEditor.getState().doc.groups[0] as Group).layers
    useEditor.getState().select([(a as Layer).id])
    const handled = handleEditorKey(key('Delete'), useEditor.getState())
    expect(handled).toBe(true)
    expect(useEditor.getState().doc.groups[0]?.layers.map((l) => l.name)).toEqual(['B'])
  })

  it('Backspace removes a selected group with keepLayers=false', () => {
    const groupId = useEditor.getState().doc.groups[0]?.id as string
    useEditor.getState().selectGroup(groupId)
    const handled = handleEditorKey(key('Backspace'), useEditor.getState())
    expect(handled).toBe(true)
    expect(useEditor.getState().doc.groups).toHaveLength(0)
  })

  it('Cmd/Ctrl+D duplicates the selected layers', () => {
    const [a] = (useEditor.getState().doc.groups[0] as Group).layers
    useEditor.getState().select([(a as Layer).id])
    const handled = handleEditorKey(key('d', { metaKey: true }), useEditor.getState())
    expect(handled).toBe(true)
    expect(useEditor.getState().doc.groups[0]?.layers.map((l) => l.name)).toEqual([
      'A copy',
      'A',
      'B',
    ])
  })

  it('Cmd/Ctrl+G groups the selected layers', () => {
    const layers = (useEditor.getState().doc.groups[0] as Group).layers
    const [a, b] = layers
    useEditor.getState().select([(a as Layer).id, (b as Layer).id])
    const handled = handleEditorKey(key('g', { metaKey: true }), useEditor.getState())
    expect(handled).toBe(true)
    // the new group is inserted at the index of the original group, which is kept (now empty)
    expect(useEditor.getState().doc.groups[0]?.name).toMatch(/^Group \d+$/)
    expect(useEditor.getState().doc.groups[0]?.layers.map((l) => l.name)).toEqual(['A', 'B'])
  })

  it('Escape clears the selection', () => {
    const [a] = (useEditor.getState().doc.groups[0] as Group).layers
    useEditor.getState().select([(a as Layer).id])
    const handled = handleEditorKey(key('Escape'), useEditor.getState())
    expect(handled).toBe(true)
    expect(useEditor.getState().selection).toEqual({ layerIds: [], groupId: null })
  })

  it('Arrow keys nudge selected layers by 1pt', () => {
    const [a] = (useEditor.getState().doc.groups[0] as Group).layers
    useEditor.getState().select([(a as Layer).id])
    const handled = handleEditorKey(key('ArrowRight'), useEditor.getState())
    expect(handled).toBe(true)
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform.x).toBe(1)
  })

  it('Shift+Arrow keys nudge selected layers by 10pt', () => {
    const [a] = (useEditor.getState().doc.groups[0] as Group).layers
    useEditor.getState().select([(a as Layer).id])
    handleEditorKey(key('ArrowDown', { shiftKey: true }), useEditor.getState())
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform.y).toBe(10)
  })

  it('treats each arrow press as its own undo step', () => {
    const [a] = (useEditor.getState().doc.groups[0] as Group).layers
    useEditor.getState().select([(a as Layer).id])
    handleEditorKey(key('ArrowRight'), useEditor.getState())
    handleEditorKey(key('ArrowRight'), useEditor.getState())
    expect(useEditor.temporal.getState().pastStates).toHaveLength(2)
  })

  it('returns false for an unrecognized key', () => {
    const handled = handleEditorKey(key('a'), useEditor.getState())
    expect(handled).toBe(false)
  })

  it('selects every layer on Cmd/Ctrl+A', () => {
    const state = useEditor.getState()
    expect(handleEditorKey(key('a', { metaKey: true }), state)).toBe(true)
    const ids = state.doc.groups.flatMap((g) => g.layers.map((l) => l.id))
    expect(useEditor.getState().selection.layerIds).toEqual(ids)
    expect(useEditor.getState().selection.groupId).toBeNull()
  })
})
