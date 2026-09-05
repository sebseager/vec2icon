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
