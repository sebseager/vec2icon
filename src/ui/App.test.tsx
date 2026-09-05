import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importSvgFiles } from '@/core/svg'
import { fixture } from '@/core/svg/__fixtures__'
import { useEditor } from '@/state'
import App from './App'
import { resetEditor } from './test-utils'

vi.mock('@/ui/canvas/CanvasPane', () => ({
  CanvasPane: () => <div data-testid="canvas-pane" />,
}))

const importFixture = async (name: string): Promise<void> => {
  const result = await importSvgFiles([{ name, data: fixture(name) }])
  await act(async () => {
    useEditor.getState().importGroups(result.groups)
  })
}

beforeEach(() => {
  resetEditor()
})

afterEach(cleanup)

describe('App', () => {
  it('renders the three panes and the document name', () => {
    render(<App />)
    expect(screen.getByRole('complementary', { name: 'Layers' })).toBeTruthy()
    expect(screen.getByTestId('canvas-pane')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rename icon' }).textContent).toBe('Icon')
  })

  it('lists imported layers top-most first', async () => {
    render(<App />)
    await importFixture('background-rect.svg')

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByTestId('layer-name').textContent)).toEqual([
      'Glyph',
      'Backdrop',
    ])
  })

  it('selects a layer when its row is clicked and shows it in the inspector', async () => {
    const user = userEvent.setup()
    render(<App />)
    await importFixture('background-rect.svg')

    await user.click(screen.getByText('Backdrop'))

    const layerId = useEditor.getState().selection.layerIds[0]
    expect(layerId).toBeDefined()
    const inspector = screen.getByRole('complementary', { name: 'Inspector' })
    expect(within(inspector).getByLabelText<HTMLInputElement>('Name').value).toBe('Backdrop')
  })

  it('enables undo once the document has changed', async () => {
    render(<App />)
    const undo = screen.getByRole('button', { name: /^Undo/ })
    expect(undo.hasAttribute('disabled')).toBe(true)

    await act(async () => {
      useEditor.getState().renameDoc('Mail')
    })

    expect(screen.getByRole('button', { name: /^Undo/ }).hasAttribute('disabled')).toBe(false)
  })

  it('hides the issues badge until there are issues, then counts them', async () => {
    render(<App />)
    expect(screen.queryByRole('button', { name: /issue/i })).toBeNull()

    await importFixture('background-rect.svg')

    const badge = screen.getByRole('button', { name: /issue/i })
    expect(badge.textContent).toContain('1')
  })
})
