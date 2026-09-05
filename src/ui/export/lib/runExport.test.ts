import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildBundle, combinedSvg, downloadBlob, flatPng } from '@/core/export'
import { emptyDoc } from '@/core/model/defaults'
import type { Renderer, RenderOptions } from '@/core/render'
import { defaultExportOptions, runExport } from './runExport'

vi.mock('@/core/export', () => ({
  buildBundle: vi.fn(),
  downloadBlob: vi.fn(),
  flatPng: vi.fn(),
  combinedSvg: vi.fn(),
  rasterizeSvg: vi.fn(),
  sanitizeName: (name: string, fallback: string) => name || fallback,
}))

const renderOptions: RenderOptions = {
  rendition: 'tintedDark',
  platform: 'ios',
  wallpaper: 'light',
  lightAngle: 315,
  tint: { space: 'srgb', components: [0, 0, 0, 1] },
  pixelRatio: 2,
}

const zip = new Blob(['zip'], { type: 'application/zip' })

const setup = () => {
  const toast = vi.fn()
  const doc = emptyDoc('My Icon')
  return { toast, doc }
}

beforeEach(() => {
  vi.mocked(buildBundle).mockReset()
  vi.mocked(downloadBlob).mockReset()
  vi.mocked(flatPng).mockReset()
  vi.mocked(combinedSvg).mockReset()
  vi.mocked(buildBundle).mockResolvedValue({
    fileName: 'My Icon.icon.zip',
    blob: zip,
    entries: [],
  })
  vi.mocked(downloadBlob).mockResolvedValue('saved')
  vi.mocked(flatPng).mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  vi.mocked(combinedSvg).mockReturnValue('<svg/>')
})

describe('runExport', () => {
  it('builds and downloads the bundle in the chosen asset format', async () => {
    const { toast, doc } = setup()
    await runExport({
      doc,
      options: { ...defaultExportOptions(), assetFormat: 'png' },
      renderOptions,
      getRenderer: () => null,
      toast,
    })
    expect(buildBundle).toHaveBeenCalledWith(doc, expect.objectContaining({ assetFormat: 'png' }))
    expect(downloadBlob).toHaveBeenCalledWith(zip, 'My Icon.icon.zip', expect.anything())
    expect(toast).toHaveBeenCalledWith('Exported My Icon.icon')
  })

  it('adds a glassless flat PNG when asked', async () => {
    const { toast, doc } = setup()
    await runExport({
      doc,
      options: { ...defaultExportOptions(), flatPng: true, flatGlass: 'none' },
      renderOptions,
      getRenderer: () => null,
      toast,
    })
    expect(flatPng).toHaveBeenCalledWith(doc, 1024, { platform: 'ios' })
    expect(vi.mocked(downloadBlob).mock.calls[1]?.[1]).toBe('My Icon.png')
  })

  it('asks the live renderer for the approximate-glass flat PNG', async () => {
    const { toast, doc } = setup()
    const toBlob = vi.fn().mockResolvedValue(new Blob(['glass'], { type: 'image/png' }))
    const renderer = { kind: 'gl', toBlob } as unknown as Renderer
    await runExport({
      doc,
      options: { ...defaultExportOptions(), flatPng: true, flatGlass: 'approximate' },
      renderOptions,
      getRenderer: () => renderer,
      toast,
    })
    expect(toBlob).toHaveBeenCalledWith(doc, { ...renderOptions, rendition: 'default' }, 1024)
    expect(flatPng).not.toHaveBeenCalled()
  })

  it('falls back to the flat PNG and says so when there is no renderer', async () => {
    const { toast, doc } = setup()
    await runExport({
      doc,
      options: { ...defaultExportOptions(), flatPng: true, flatGlass: 'approximate' },
      renderOptions,
      getRenderer: () => null,
      toast,
    })
    expect(flatPng).toHaveBeenCalledWith(doc, 1024, { platform: 'ios' })
    expect(toast).toHaveBeenCalledWith(
      'The preview was unavailable, so the flat PNG was saved without glass.',
    )
  })

  it('adds the combined SVG with the background option', async () => {
    const { toast, doc } = setup()
    await runExport({
      doc,
      options: { ...defaultExportOptions(), combinedSvg: true, combinedBackground: true },
      renderOptions,
      getRenderer: () => null,
      toast,
    })
    expect(combinedSvg).toHaveBeenCalledWith(doc, { background: true })
    expect(vi.mocked(downloadBlob).mock.calls[1]?.[1]).toBe('My Icon.svg')
  })

  it('does not claim success when the save panel was cancelled', async () => {
    const { toast, doc } = setup()
    vi.mocked(downloadBlob).mockResolvedValue('cancelled')
    const ok = await runExport({
      doc,
      options: defaultExportOptions(),
      renderOptions,
      getRenderer: () => null,
      toast,
    })
    expect(ok).toBe(false)
    expect(toast).toHaveBeenCalledWith('Export cancelled — nothing was saved.')
    expect(toast).not.toHaveBeenCalledWith('Exported My Icon.icon')
  })

  it('names the extra file the user cancelled after the bundle was saved', async () => {
    const { toast, doc } = setup()
    vi.mocked(downloadBlob).mockResolvedValueOnce('saved').mockResolvedValueOnce('cancelled')
    const ok = await runExport({
      doc,
      options: { ...defaultExportOptions(), flatPng: true },
      renderOptions,
      getRenderer: () => null,
      toast,
    })
    expect(ok).toBe(false)
    expect(toast).toHaveBeenCalledWith('Saved My Icon.icon, but My Icon.png was cancelled.')
  })

  it('reports a failure as a toast and says it did not succeed', async () => {
    const { toast, doc } = setup()
    vi.mocked(buildBundle).mockRejectedValue(new Error('disk full'))
    const ok = await runExport({
      doc,
      options: defaultExportOptions(),
      renderOptions,
      getRenderer: () => null,
      toast,
    })
    expect(ok).toBe(false)
    expect(toast).toHaveBeenCalledWith('Export failed: disk full')
  })
})
