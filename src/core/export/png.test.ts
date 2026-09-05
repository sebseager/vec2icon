import { describe, expect, it, vi } from 'vitest'
import { createGroup, createLayer, emptyDoc } from '../model/defaults'
import type { IconDoc } from '../model/types'
import { combinedSvg } from './combined-svg'
import { flatPng, rasterizeSvg } from './png'

const doc = (): IconDoc => ({
  ...emptyDoc(),
  groups: [
    createGroup('G', [
      createLayer({
        name: 'A',
        svg: '<g><title>A</title></g>',
        defs: '',
        sourceViewBox: [0, 0, 100, 100],
        bbox: { x: 0, y: 0, width: 100, height: 100 },
      }),
    ]),
  ],
})

describe('flatPng', () => {
  it('rasterizes the combined svg with the background at the given size', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    const rasterize = vi.fn().mockResolvedValue(blob)
    const d = doc()

    await expect(flatPng(d, 512, { rasterize })).resolves.toBe(blob)
    expect(rasterize).toHaveBeenCalledTimes(1)
    expect(rasterize).toHaveBeenCalledWith(combinedSvg(d, { background: true }), 512)
  })

  it('defaults to 1024', async () => {
    const rasterize = vi.fn().mockResolvedValue(new Blob([]))
    await flatPng(doc(), undefined, { rasterize })
    expect(rasterize.mock.calls[0]?.[1]).toBe(1024)
  })

  it('clips to the platform mask when one is given', async () => {
    const rasterize = vi.fn().mockResolvedValue(new Blob([]))
    const d = doc()
    await flatPng(d, 256, { rasterize, platform: 'watchos' })
    expect(rasterize).toHaveBeenCalledWith(
      combinedSvg(d, { background: true, platform: 'watchos' }),
      256,
    )
    expect(rasterize.mock.calls[0]?.[0]).toContain('clip-path="url(#platform-mask)"')
  })

  it('propagates rasterizer failures', async () => {
    const rasterize = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(flatPng(doc(), 64, { rasterize })).rejects.toThrow('boom')
  })
})

describe('rasterizeSvg', () => {
  it('is the default rasterizer', () => {
    expect(typeof rasterizeSvg).toBe('function')
  })
})
