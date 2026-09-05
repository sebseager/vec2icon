import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGroup, createLayer } from '@/core/model/defaults'
import { useEditor } from '@/state'
import { resetEditor } from '../test-utils'
import { LayersPanel } from './LayersPanel'

beforeEach(() => {
  resetEditor()
  const layer = createLayer({
    name: 'Glyph',
    svg: '<g><path d="M0 0 L10 10 Z"/></g>',
    defs: '',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 0, y: 0, width: 10, height: 10 },
  })
  useEditor.getState().addGroups([createGroup('One', [layer])])
})
afterEach(cleanup)

describe('row context menu', () => {
  it('duplicates a layer', async () => {
    const user = userEvent.setup()
    render(<LayersPanel />)
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('Glyph') })
    await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(useEditor.getState().doc.groups[0]?.layers).toHaveLength(2)
  })
})
