import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGroup, createLayer } from '@/core/model/defaults'
import type { Fill } from '@/core/model/types'
import { useEditor } from '@/state'
import { resetEditor } from '../test-utils'
import { Inspector } from './Inspector'

const LAYER_ID = 'layer-1'

const overrideFill = (): Fill | undefined => {
  const layer = useEditor.getState().doc.groups[0]?.layers[0]
  return layer?.overrides.dark?.fill
}

beforeEach(() => {
  resetEditor()
  const layer = createLayer({
    id: LAYER_ID,
    name: 'Glyph',
    svg: '<g><path d="M0 0 L10 10 Z"/></g>',
    defs: '',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 0, y: 0, width: 10, height: 10 },
  })
  const state = useEditor.getState()
  state.addGroups([createGroup('One', [layer])])
  state.select([LAYER_ID])
  state.setView({ appearance: 'dark' })
})

afterEach(cleanup)

describe('override fill kind', () => {
  it('converts to a gray color when switching Solid to Gray', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    const select = screen.getByLabelText<HTMLSelectElement>('Override fill')

    await user.selectOptions(select, 'solid')
    await user.selectOptions(select, 'gray')

    const fill = overrideFill()
    expect(fill?.kind).toBe('solid')
    expect(fill?.kind === 'solid' && fill.color.space).toBe('gray')
    expect(select.value).toBe('gray')
  })

  it('converts back to an rgb color when switching Gray to Solid', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    const select = screen.getByLabelText<HTMLSelectElement>('Override fill')

    await user.selectOptions(select, 'gray')
    await user.selectOptions(select, 'solid')

    const fill = overrideFill()
    expect(fill?.kind === 'solid' && fill.color.space).toBe('srgb')
    expect(select.value).toBe('solid')
    expect(screen.getByLabelText('Override color')).toBeTruthy()
  })

  it('clears the override when switching back to Inherit', async () => {
    const user = userEvent.setup()
    render(<Inspector />)
    const select = screen.getByLabelText<HTMLSelectElement>('Override fill')

    await user.selectOptions(select, 'gray')
    await user.selectOptions(select, 'inherit')

    expect(overrideFill()).toBeUndefined()
  })
})
