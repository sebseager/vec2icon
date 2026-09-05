import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBundle, combinedSvg, downloadBlob } from '@/core/export'
import { createGroup, createLayer, emptyDoc } from '@/core/model/defaults'
import { useEditor } from '@/state'
import { ExportDialog } from './ExportDialog'

vi.mock('@/core/export', () => ({
  buildBundle: vi.fn(),
  downloadBlob: vi.fn(),
  flatPng: vi.fn(),
  combinedSvg: vi.fn(),
  rasterizeSvg: vi.fn(),
  sanitizeName: (name: string, fallback: string) => name || fallback,
}))

const docWithArt = () => ({
  ...emptyDoc('My Icon'),
  groups: [
    createGroup('Group', [
      createLayer({
        name: 'Shape',
        svg: '<g/>',
        defs: '',
        sourceViewBox: [0, 0, 1024, 1024] as [number, number, number, number],
        bbox: { x: 0, y: 0, width: 100, height: 100 },
      }),
    ]),
  ],
})

beforeEach(() => {
  vi.mocked(buildBundle).mockReset()
  vi.mocked(downloadBlob).mockReset()
  vi.mocked(combinedSvg).mockReset()
  vi.mocked(buildBundle).mockResolvedValue({
    fileName: 'My Icon.icon.zip',
    blob: new Blob(['zip'], { type: 'application/zip' }),
    entries: [],
  })
  vi.mocked(downloadBlob).mockResolvedValue('saved')
  vi.mocked(combinedSvg).mockReturnValue('<svg/>')
  useEditor.setState({ doc: docWithArt(), selection: { layerIds: [], groupId: null } })
  useEditor.getState().setView({ exportOpen: true })
})

afterEach(cleanup)

describe('ExportDialog', () => {
  it('stays closed until the view asks for it', () => {
    useEditor.getState().setView({ exportOpen: false })
    render(<ExportDialog />)
    expect(screen.queryByText('Export icon')).toBeNull()
  })

  it('exports the bundle with the chosen asset format', async () => {
    render(<ExportDialog />)
    await userEvent.click(screen.getByRole('radio', { name: 'PNG' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))

    await waitFor(() => expect(buildBundle).toHaveBeenCalled())
    expect(vi.mocked(buildBundle).mock.calls[0]?.[1]).toMatchObject({ assetFormat: 'png' })
    expect(vi.mocked(downloadBlob).mock.calls[0]?.[1]).toBe('My Icon.icon.zip')
    await waitFor(() => expect(useEditor.getState().view.exportOpen).toBe(false))
    expect(useEditor.getState().toasts.at(-1)?.message).toBe('Exported My Icon.icon')
  })

  it('defaults to SVG assets and no extras', async () => {
    render(<ExportDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await waitFor(() => expect(buildBundle).toHaveBeenCalled())
    expect(vi.mocked(buildBundle).mock.calls[0]?.[1]).toMatchObject({ assetFormat: 'svg' })
    expect(combinedSvg).not.toHaveBeenCalled()
    expect(vi.mocked(downloadBlob).mock.calls).toHaveLength(1)
  })

  it('adds the combined SVG when it is ticked', async () => {
    render(<ExportDialog />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Also save combined SVG' }))
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await waitFor(() =>
      expect(combinedSvg).toHaveBeenCalledWith(expect.anything(), { background: true }),
    )
    expect(vi.mocked(downloadBlob).mock.calls[1]?.[1]).toBe('My Icon.svg')
  })

  it('stays open when the export fails', async () => {
    vi.mocked(buildBundle).mockRejectedValue(new Error('disk full'))
    render(<ExportDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    await waitFor(() =>
      expect(useEditor.getState().toasts.at(-1)?.message).toBe('Export failed: disk full'),
    )
    expect(useEditor.getState().view.exportOpen).toBe(true)
    expect(screen.getByRole('button', { name: 'Export' })).toHaveProperty('disabled', false)
  })

  it('closes without exporting on cancel', async () => {
    render(<ExportDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(useEditor.getState().view.exportOpen).toBe(false))
    expect(buildBundle).not.toHaveBeenCalled()
  })

  it('cannot export an empty document', () => {
    useEditor.setState({ doc: emptyDoc('My Icon') })
    render(<ExportDialog />)
    expect(screen.getByRole('button', { name: 'Export' })).toHaveProperty('disabled', true)
  })
})
