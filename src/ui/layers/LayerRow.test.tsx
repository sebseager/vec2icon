import { cleanup, render, screen } from '@testing-library/react'
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGroup, createLayer } from '@/core/model/defaults'
import { useEditor } from '@/state'
import { resetEditor } from '../test-utils'
import { LayersPanel } from './LayersPanel'

const layerNamed = (name: string) =>
  createLayer({
    name,
    svg: '<g><path d="M0 0 L10 10 Z"/></g>',
    defs: '',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 0, y: 0, width: 10, height: 10 },
  })

const selectedNames = (): string[] => {
  const { doc, selection } = useEditor.getState()
  return doc.groups
    .flatMap((g) => g.layers)
    .filter((l) => selection.layerIds.includes(l.id))
    .map((l) => l.name)
}

beforeEach(() => {
  resetEditor()
  useEditor
    .getState()
    .addGroups([
      createGroup('One', [layerNamed('Glyph'), layerNamed('Ring'), layerNamed('Dot')]),
      createGroup('Two', [layerNamed('Shadow')]),
    ])
})
afterEach(cleanup)

describe('row context menu', () => {
  it('duplicates a layer', async () => {
    const user = userEvent.setup()
    render(<LayersPanel />)
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('Glyph') })
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(useEditor.getState().doc.groups[0]?.layers).toHaveLength(4)
  })

  it('moves the row to another group', async () => {
    // the submenu positioner never lays out under happy-dom, so it keeps
    // pointer-events: none; the events still dispatch, only the check is skipped
    const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never })
    render(<LayersPanel />)
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('Glyph') })
    await user.hover(screen.getByRole('menuitem', { name: 'Move to group' }))
    const target = await screen.findByRole('menuitem', { name: 'Two' })
    target.focus()
    await user.keyboard('{Enter}')
    const groups = useEditor.getState().doc.groups
    expect(groups[0]?.layers.map((l) => l.name)).toEqual(['Ring', 'Dot'])
    expect(groups[1]?.layers.map((l) => l.name)).toEqual(['Glyph', 'Shadow'])
  })
})

describe('selecting rows', () => {
  it('toggles rows with Cmd/Ctrl and extends a range with Shift', async () => {
    const user = userEvent.setup()
    render(<LayersPanel />)
    await user.click(screen.getByText('Glyph'))
    expect(selectedNames()).toEqual(['Glyph'])

    await user.keyboard('{Control>}')
    await user.click(screen.getByText('Dot'))
    await user.keyboard('{/Control}')
    expect(selectedNames()).toEqual(['Glyph', 'Dot'])

    await user.keyboard('{Control>}')
    await user.click(screen.getByText('Dot'))
    await user.keyboard('{/Control}')
    expect(selectedNames()).toEqual(['Glyph'])

    await user.keyboard('{Shift>}')
    await user.click(screen.getByText('Shadow'))
    await user.keyboard('{/Shift}')
    expect(selectedNames()).toEqual(['Glyph', 'Ring', 'Dot', 'Shadow'])
  })

  it('selects every layer of a group from its menu', async () => {
    const user = userEvent.setup()
    render(<LayersPanel />)
    await user.click(screen.getByRole('button', { name: 'One options' }))
    await user.click(screen.getByRole('menuitem', { name: 'Select all layers' }))
    expect(selectedNames()).toEqual(['Glyph', 'Ring', 'Dot'])
  })
})

describe('the panel header', () => {
  it('adds an empty group at the top and selects it', async () => {
    const user = userEvent.setup()
    render(<LayersPanel />)
    await user.click(screen.getByRole('button', { name: 'New group' }))
    const { doc, selection } = useEditor.getState()
    expect(doc.groups.map((g) => g.name)).toEqual(['New group', 'One', 'Two'])
    expect(selection.groupId).toBe(doc.groups[0]?.id)
  })
})
