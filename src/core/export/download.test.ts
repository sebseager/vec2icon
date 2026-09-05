import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from './download'

type Global = typeof globalThis & { showSaveFilePicker?: unknown }

afterEach(() => {
  const g = globalThis as Global
  g.showSaveFilePicker = undefined
  vi.restoreAllMocks()
})

const blob = (): Blob => new Blob(['x'], { type: 'application/zip' })

describe('downloadBlob', () => {
  it('writes through showSaveFilePicker when available', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    const picker = vi.fn().mockResolvedValue({
      createWritable: async () => ({ write, close }),
    })
    ;(globalThis as Global).showSaveFilePicker = picker
    const types = [{ description: 'Icon', accept: { 'application/zip': ['.zip'] } }]

    const b = blob()
    await expect(downloadBlob(b, 'My Icon.icon.zip', { types })).resolves.toBe('saved')

    expect(picker).toHaveBeenCalledWith({ suggestedName: 'My Icon.icon.zip', types })
    expect(write).toHaveBeenCalledWith(b)
    expect(close).toHaveBeenCalled()
  })

  it('reports the user cancelling the picker and does not fall back', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    ;(globalThis as Global).showSaveFilePicker = vi.fn().mockRejectedValue(abort)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await expect(downloadBlob(blob(), 'a.zip')).resolves.toBe('cancelled')
    expect(click).not.toHaveBeenCalled()
  })

  it('falls back to an anchor download when the picker fails for another reason', async () => {
    ;(globalThis as Global).showSaveFilePicker = vi.fn().mockRejectedValue(new Error('nope'))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await expect(downloadBlob(blob(), 'a.zip')).resolves.toBe('fallback')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('uses an anchor with a blob url when no picker exists, and cleans up after the click', async () => {
    vi.useFakeTimers()
    try {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake')
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      let anchor: HTMLAnchorElement | undefined
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        anchor = this
      })

      await downloadBlob(blob(), 'My Icon.icon.zip')

      expect(createObjectURL).toHaveBeenCalled()
      expect(click).toHaveBeenCalledTimes(1)
      expect(anchor?.getAttribute('href')).toBe('blob:fake')
      expect(anchor?.download).toBe('My Icon.icon.zip')
      expect(anchor?.isConnected).toBe(false)

      // the blob url must outlive the click that started the download
      expect(revokeObjectURL).not.toHaveBeenCalled()
      vi.runAllTimers()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake')
    } finally {
      vi.useRealTimers()
    }
  })
})
