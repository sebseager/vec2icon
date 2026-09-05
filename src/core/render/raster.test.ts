import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResolvedLayer } from '../model/appearance'
import { createLayer } from '../model/defaults'
import { layerMatrix } from '../model/geometry'
import type { Color, Fill, Layer } from '../model/types'
import {
  clearRasterCache,
  isDrawableBitmap,
  layerRenderSvg,
  peekRaster,
  rasterCacheKey,
  rasterizeLayer,
  reserveRasterCache,
} from './raster'

const srgb = (r: number, g: number, b: number, a = 1): Color => ({
  space: 'srgb',
  components: [r, g, b, a],
})

const layerOf = (over: Partial<Layer> = {}): Layer =>
  createLayer({
    name: 'L',
    svg: '<g><path d="M0 0h10v10H0z" fill="#f00"/></g>',
    defs: '<linearGradient id="g"><stop offset="0"/></linearGradient>',
    sourceViewBox: [0, 0, 10, 10],
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    ...over,
  })

const resolved = (fill: Fill | null = null): ResolvedLayer => ({
  fill,
  opacity: 0.5,
  hidden: false,
  blendMode: 'normal',
})

const matrixOf = (layer: Layer): string => {
  const m = layerMatrix(layer)
  return `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f]
    .map((n) => {
      const r = Math.round(n * 1e6) / 1e6
      return (r === 0 ? 0 : r).toString()
    })
    .join(' ')})`
}

describe('layerRenderSvg', () => {
  it('produces a standalone 1024 svg with the namespace', () => {
    const svg = layerRenderSvg(layerOf(), resolved())
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="0 0 1024 1024"')
    expect(svg).toContain('width="1024"')
    expect(svg).toContain('height="1024"')
    expect(svg.endsWith('</svg>')).toBe(true)
  })

  it('bakes the layer matrix onto a wrapping group', () => {
    const layer = layerOf({ transform: { x: 12, y: -4, scaleX: 2, scaleY: 2, rotation: 30 } })
    const svg = layerRenderSvg(layer, resolved())
    expect(svg).toContain(`transform="${matrixOf(layer)}"`)
  })

  it('inlines the layer defs and its own markup', () => {
    const svg = layerRenderSvg(layerOf(), resolved())
    expect(svg).toContain('<linearGradient id="g">')
    expect(svg).toContain('<path d="M0 0h10v10H0z" fill="#f00"/>')
  })

  it('does not wrap in a mask when there is no fill override', () => {
    const svg = layerRenderSvg(layerOf(), resolved())
    expect(svg).not.toContain('<mask')
    expect(svg).not.toContain('mask="url(')
  })

  it('never bakes opacity into the svg (the compositor applies it)', () => {
    const svg = layerRenderSvg(layerOf({ opacity: 0.25 }), { ...resolved(), opacity: 0.25 })
    expect(svg).not.toContain('opacity="0.25"')
  })

  it('wraps the fragment in an alpha mask over a filled rect for a solid fill', () => {
    const svg = layerRenderSvg(layerOf(), resolved({ kind: 'solid', color: srgb(0, 0.5, 1) }))
    expect(svg).toContain('<mask')
    expect(svg).toContain('style="mask-type:alpha"')
    expect(svg).toMatch(/<rect[^>]*mask="url\(#[^)]+\)"/)
    expect(svg).toContain('rgb(0, 128, 255)')
  })

  it('uses the mask id it declares', () => {
    const svg = layerRenderSvg(layerOf(), resolved({ kind: 'solid', color: srgb(1, 0, 0) }))
    const declared = svg.match(/<mask id="([^"]+)"/)?.[1]
    expect(declared).toBeTruthy()
    expect(svg).toContain(`mask="url(#${declared})"`)
  })

  it('renders a gray solid fill', () => {
    const svg = layerRenderSvg(
      layerOf(),
      resolved({ kind: 'solid', color: { space: 'gray', components: [0.5, 1] } }),
    )
    expect(svg).toContain('rgb(128, 128, 128)')
  })

  it('carries a fill alpha through as fill-opacity', () => {
    const svg = layerRenderSvg(layerOf(), resolved({ kind: 'solid', color: srgb(1, 0, 0, 0.4) }))
    expect(svg).toContain('fill-opacity="0.4"')
  })

  it('paints nothing for a `none` fill override', () => {
    const svg = layerRenderSvg(layerOf(), resolved({ kind: 'none' }))
    expect(svg).toContain('fill="none"')
  })

  it('emits a two-stop linear gradient for an automatic gradient fill', () => {
    const svg = layerRenderSvg(
      layerOf(),
      resolved({ kind: 'automatic-gradient', color: srgb(0.2, 0.4, 0.8) }),
    )
    const fillId = svg.match(/<rect[^>]*fill="url\(#([^)]+)\)"/)?.[1]
    expect(fillId).toBeTruthy()
    const def = svg.match(new RegExp(`<linearGradient id="${fillId}"[^>]*>(.*?)</linearGradient>`))
    expect((def?.[1]?.match(/<stop /g) ?? []).length).toBe(2)
  })

  it('emits the requested angle for a linear gradient fill', () => {
    const svg = layerRenderSvg(
      layerOf(),
      resolved({ kind: 'linear-gradient', colors: [srgb(1, 0, 0), srgb(0, 0, 1)], angle: 90 }),
    )
    expect(svg).toContain('x1="0"')
    expect(svg).toContain('y1="0.5"')
    expect(svg).toContain('x2="1"')
    expect(svg).toContain('y2="0.5"')
  })
})

describe('rasterCacheKey', () => {
  it('is stable for identical inputs', () => {
    const a = rasterCacheKey(layerOf({ id: 'a' }), resolved(), 1024)
    const b = rasterCacheKey(layerOf({ id: 'b' }), resolved(), 1024)
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-z]+$/)
  })

  it('changes with the svg markup', () => {
    const a = rasterCacheKey(layerOf(), resolved(), 1024)
    const b = rasterCacheKey(layerOf({ svg: '<g><circle r="1"/></g>' }), resolved(), 1024)
    expect(a).not.toBe(b)
  })

  it('changes with the defs', () => {
    const a = rasterCacheKey(layerOf(), resolved(), 1024)
    const b = rasterCacheKey(layerOf({ defs: '<mask id="x"/>' }), resolved(), 1024)
    expect(a).not.toBe(b)
  })

  it('changes with the transform', () => {
    const a = rasterCacheKey(layerOf(), resolved(), 1024)
    const b = rasterCacheKey(
      layerOf({ transform: { x: 1, y: 0, scaleX: 1, scaleY: 1, rotation: 0 } }),
      resolved(),
      1024,
    )
    expect(a).not.toBe(b)
  })

  it('changes with the source viewBox and bbox', () => {
    const a = rasterCacheKey(layerOf(), resolved(), 1024)
    expect(rasterCacheKey(layerOf({ sourceViewBox: [0, 0, 20, 20] }), resolved(), 1024)).not.toBe(a)
    expect(
      rasterCacheKey(layerOf({ bbox: { x: 1, y: 0, width: 10, height: 10 } }), resolved(), 1024),
    ).not.toBe(a)
  })

  it('changes with the appearance override', () => {
    const a = rasterCacheKey(layerOf(), resolved(), 1024)
    const b = rasterCacheKey(layerOf(), resolved({ kind: 'solid', color: srgb(1, 0, 0) }), 1024)
    expect(a).not.toBe(b)
  })

  it('changes with the size', () => {
    const a = rasterCacheKey(layerOf(), resolved(), 1024)
    const b = rasterCacheKey(layerOf(), resolved(), 512)
    expect(a).not.toBe(b)
  })
})

describe('clearRasterCache', () => {
  it('is safe to call when nothing is cached', () => {
    expect(() => clearRasterCache()).not.toThrow()
    expect(() => clearRasterCache()).not.toThrow()
  })
})

describe('isDrawableBitmap', () => {
  // ImageBitmap.close() zeroes width and height; drawing a closed bitmap throws
  it('rejects a closed bitmap', () => {
    expect(isDrawableBitmap({ width: 0, height: 0 } as ImageBitmap)).toBe(false)
  })

  it('accepts a live bitmap', () => {
    expect(isDrawableBitmap({ width: 64, height: 64 } as ImageBitmap)).toBe(true)
  })

  it('rejects a bitmap with either dimension zeroed', () => {
    expect(isDrawableBitmap({ width: 64, height: 0 } as ImageBitmap)).toBe(false)
    expect(isDrawableBitmap({ width: 0, height: 64 } as ImageBitmap)).toBe(false)
  })
})

/**
 * happy-dom never fires Image.onload for a blob URL and has no usable 2D context,
 * so the raster chain is stubbed to make rasterizeLayer actually resolve. Without
 * this the cache-policy tests below would all pass vacuously.
 */
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_value: string) {
    queueMicrotask(() => this.onload?.())
  }
}

class FakeOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext() {
    return { clearRect() {}, drawImage() {} }
  }
}

const makeBitmap = () => {
  const bitmap = {
    width: 1024,
    height: 1024,
    closed: false,
    close() {
      bitmap.closed = true
      bitmap.width = 0
      bitmap.height = 0
    },
  }
  return bitmap
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('raster cache policy', () => {
  const r = { fill: null, opacity: 1, hidden: false, blendMode: 'normal' as const }

  beforeEach(() => {
    clearRasterCache()
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
    vi.stubGlobal('createImageBitmap', async () => makeBitmap())
  })

  afterEach(() => {
    clearRasterCache()
    vi.unstubAllGlobals()
  })

  it('peekRaster returns null for a layer that has not been rasterized', () => {
    expect(peekRaster(layerOf(), r, 1024)).toBeNull()
  })

  it('peekRaster returns the bitmap once rasterizeLayer resolves', async () => {
    const layer = layerOf()
    await rasterizeLayer(layer, r, 1024)
    const bitmap = peekRaster(layer, r, 1024)
    expect(bitmap).not.toBeNull()
    expect(bitmap?.width).toBe(1024)
  })

  it('peekRaster starts no work of its own', async () => {
    const layer = layerOf()
    expect(peekRaster(layer, r, 1024)).toBeNull()
    await flush()
    // still nothing: only rasterizeLayer creates entries
    expect(peekRaster(layer, r, 1024)).toBeNull()
  })

  it('peekRaster returns null after clearRasterCache closes the bitmap', async () => {
    const layer = layerOf()
    await rasterizeLayer(layer, r, 1024)
    expect(peekRaster(layer, r, 1024)).not.toBeNull()
    clearRasterCache()
    await flush()
    expect(peekRaster(layer, r, 1024)).toBeNull()
  })

  it('evicts past the base bound when nothing is reserved', async () => {
    const layers = Array.from({ length: 70 }, (_, i) =>
      layerOf({ svg: `<g><path d="M0 0h${i + 1}v1H0z"/></g>` }),
    )
    for (const layer of layers) await rasterizeLayer(layer, r, 1024)
    await flush()
    // the oldest entries are gone once the 64-entry base bound is exceeded
    expect(peekRaster(layers[0] as Layer, r, 1024)).toBeNull()
    expect(peekRaster(layers[69] as Layer, r, 1024)).not.toBeNull()
  })

  it('keeps a reserved working set resident so a frame is never partly evicted', async () => {
    const layers = Array.from({ length: 70 }, (_, i) =>
      layerOf({ svg: `<g><path d="M0 0h${i + 1}v2H0z"/></g>` }),
    )
    reserveRasterCache(layers.length)
    for (const layer of layers) await rasterizeLayer(layer, r, 1024)
    await flush()
    for (const layer of layers) {
      expect(peekRaster(layer, r, 1024)).not.toBeNull()
    }
  })

  it('drops the reservation on clearRasterCache', async () => {
    reserveRasterCache(500)
    clearRasterCache()
    const layers = Array.from({ length: 70 }, (_, i) =>
      layerOf({ svg: `<g><path d="M0 0h${i + 1}v3H0z"/></g>` }),
    )
    for (const layer of layers) await rasterizeLayer(layer, r, 1024)
    await flush()
    expect(peekRaster(layers[0] as Layer, r, 1024)).toBeNull()
  })

  it('ignores a negative or non-finite reservation', () => {
    expect(() => reserveRasterCache(Number.NaN)).not.toThrow()
    expect(() => reserveRasterCache(-5)).not.toThrow()
    expect(() => reserveRasterCache(Number.POSITIVE_INFINITY)).not.toThrow()
  })
})
