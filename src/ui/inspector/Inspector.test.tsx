import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useEditor } from '@/state'
import { resetEditor } from '../test-utils'
import { Inspector } from './Inspector'

beforeEach(() => {
  resetEditor()
})

afterEach(cleanup)

describe('Inspector with one layer selected', () => {
  const selectPaintedLayer = async () => {
    const { createGroup, createLayer } = await import('@/core/model/defaults')
    const layer = createLayer({
      name: 'Badge',
      svg: '<g><rect width="10" height="10" fill="#ff0000"/><circle r="2" fill="#00ff00" stroke="#ff0000"/></g>',
      defs: '',
      sourceViewBox: [0, 0, 100, 100],
      bbox: { x: 0, y: 0, width: 10, height: 10 },
    })
    useEditor.getState().addGroups([createGroup('One', [layer])])
    useEditor.getState().select([layer.id])
    return layer.id
  }

  it('lists each color the artwork uses as a swatch', async () => {
    await selectPaintedLayer()
    render(<Inspector />)
    expect(screen.getByText('Colors')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Color 1' }).title).toBe('#ff0000')
    expect(screen.getByRole('button', { name: 'Color 2' }).title).toBe('#00ff00')
  })

  it('recolors every use of a swatch when its hex is edited', async () => {
    const user = userEvent.setup()
    const id = await selectPaintedLayer()
    render(<Inspector />)
    await user.click(screen.getByRole('button', { name: 'Color 1' }))
    const hex = screen.getByLabelText('Hex')
    await user.clear(hex)
    await user.type(hex, '0000ff{Enter}')

    const layer = useEditor.getState().doc.groups[0]?.layers.find((l) => l.id === id)
    expect(layer?.svg).toBe(
      '<g><rect width="10" height="10" fill="#0000ff"/><circle r="2" fill="#00ff00" stroke="#0000ff"/></g>',
    )
    expect(screen.getByRole('button', { name: 'Color 1' }).title).toBe('#0000ff')
  })
})

describe('Inspector with nothing selected', () => {
  it('changes the default document fill when the fill kind changes', async () => {
    const user = userEvent.setup()
    render(<Inspector />)

    await user.selectOptions(screen.getByLabelText('Default fill kind'), 'linear-gradient')

    expect(useEditor.getState().doc.fill.default.kind).toBe('linear-gradient')
  })

  it('adds a dark fill only when "same as Default" is turned off', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    expect(useEditor.getState().doc.fill.dark).toBeUndefined()

    await user.click(screen.getByLabelText('Dark fill same as Default'))

    expect(useEditor.getState().doc.fill.dark).toBeDefined()
  })

  it('reports Xcode compatibility from the features the document uses', async () => {
    render(<Inspector />)
    expect(screen.getByText('Xcode 26 compatible')).toBeTruthy()
    cleanup()

    const { setGlass, addGroups } = useEditor.getState()
    const { createGroup } = await import('@/core/model/defaults')
    const group = createGroup('One')
    addGroups([group])
    setGlass(group.id, { specularPlacement: 'inside' })

    render(<Inspector />)
    expect(screen.getByText(/Requires Xcode 27/)).toBeTruthy()
  })
})
