/**
 * Flat-renderer tests that actually reach the layer loop.
 *
 * happy-dom gives no usable 2D context and never fires `Image.onload` for a blob
 * URL, so the whole raster chain is stubbed: a fake `Image` that loads, a fake
 * `OffscreenCanvas` with a recording 2D context, and a fake `createImageBitmap`.
 * That makes `rasterizeLayer` resolve for real, exercising raster.ts's LRU and the
 * renderer's paint/schedule loop rather than the early-return paths.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGroup, createLayer } from '../model/defaults'
import type { Color, Fill, IconDoc, Layer } from '../model/types'
import { RENDITIONS } from '../model/types'
import { createFlatRenderer } from './flat'
import { clearRasterCache, reserveRasterCache } from './raster'
import type { RenderOptions } from './types'

const options: RenderOptions = {
  rendition: 'default',
  platform: 'ios',
  wallpaper: 'light',
  lightAngle: 0,
  tint: { space: 'srgb', components: [0.2, 0.6, 1, 1] } as Color,
  pixelRatio: 1,
}

type FakeBitmap = ImageBitmap & { closed: boolean }

const makeBitmap = (): FakeBitmap => {
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
  return bitmap as unknown as FakeBitmap
}

/** Records the calls the renderer makes; every other 2D method is a no-op. */
const recordingContext = () => {
  const drawn: unknown[] = []
  const ctx = {
    drawn,
    canvas: null,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '' as unknown,
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    save() {},
    restore() {},
    clip() {},
    stroke() {},
    translate() {},
    setTransform() {},
    clearRect() {},
    fillRect() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    drawImage(source: unknown) {
      drawn.push(source)
    },
  }
  return ctx
}

const fakeCanvas = () => {
  const ctx = recordingContext()
  return {
    canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement,
    ctx,
  }
}

const layerAt = (index: number): Layer =>
  createLayer({
    name: `Layer ${index}`,
    // distinct markup so every layer gets its own raster cache key
    svg: `<g><path d="M0 0h${index + 1}v10H0z"/></g>`,
    defs: '',
    sourceViewBox: [0, 0, 10, 10],
    bbox: { x: 0, y: 0, width: 10, height: 10 },
  })

const docWithLayers = (count: number): IconDoc => ({
  name: 'Many',
  fill: { default: { kind: 'solid', color: { space: 'srgb', components: [1, 1, 1, 1] } } },
  watchOS: false,
  groups: [
    createGroup(
      'All',
      Array.from({ length: count }, (_, i) => layerAt(i)),
    ),
  ],
})

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  width = 1024
  height = 1024
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
    return recordingContext()
  }
}

/** rAF calls made by the renderer, so a runaway repaint loop is observable. */
let frames: Array<() => void>
let bitmaps: FakeBitmap[]

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** Run the single pending animation frame, if the renderer asked for one. */
const runFrame = (): boolean => {
  const next = frames.shift()
  if (!next) return false
  next()
  return true
}

beforeEach(() => {
  clearRasterCache()
  frames = []
  bitmaps = []
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
  vi.stubGlobal('createImageBitmap', async () => {
    const bitmap = makeBitmap()
    bitmaps.push(bitmap)
    return bitmap
  })
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
    frames.push(cb)
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
  clearRasterCache()
  vi.unstubAllGlobals()
})

describe('the stub harness itself', () => {
  it('lets rasterizeLayer resolve, so these tests are not vacuous', async () => {
    const { canvas, ctx } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(128, 128)
    renderer.render(docWithLayers(1), options)
    await flush()
    runFrame()
    expect(bitmaps).toHaveLength(1)
    expect(ctx.drawn).toHaveLength(1)
    renderer.dispose()
  })
})

describe('a document with more layers than the base cache bound', () => {
  it('draws all 30 layers and does not schedule another paint afterwards', async () => {
    const { canvas, ctx } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(256, 256)
    const doc = docWithLayers(30)

    // first paint: nothing is rasterized yet, so it draws no layers and asks for
    // exactly one frame once the rasters land
    renderer.render(doc, options)
    await flush()
    expect(ctx.drawn).toHaveLength(0)
    expect(frames.length).toBe(1)

    // second paint: every raster is resident, so all 30 layers make it in
    runFrame()
    await flush()
    expect(ctx.drawn).toHaveLength(30)

    // and nothing is left rotating: no further frame is requested
    expect(frames).toHaveLength(0)
    expect(runFrame()).toBe(false)
    renderer.dispose()
  })

  it('keeps every one of the 30 bitmaps alive rather than evicting a rotating subset', async () => {
    const { canvas } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(256, 256)
    renderer.render(docWithLayers(30), options)
    await flush()
    runFrame()
    await flush()
    expect(bitmaps).toHaveLength(30)
    expect(bitmaps.filter((b) => b.closed)).toHaveLength(0)
    renderer.dispose()
  })

  it('converges for a document larger than the 64-entry base bound', async () => {
    const { canvas, ctx } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(256, 256)
    renderer.render(docWithLayers(80), options)
    await flush()
    runFrame()
    await flush()
    expect(ctx.drawn).toHaveLength(80)
    expect(frames).toHaveLength(0)
    renderer.dispose()
  })
})

describe('bitmaps closed underneath the renderer', () => {
  it('re-rasterizes instead of drawing a closed bitmap after clearRasterCache', async () => {
    const { canvas, ctx } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(128, 128)
    const doc = docWithLayers(3)

    renderer.render(doc, options)
    await flush()
    runFrame()
    await flush()
    expect(ctx.drawn).toHaveLength(3)

    // close every bitmap out from under the renderer (close() is deferred off the
    // cached promise, so let the microtask queue drain first)
    clearRasterCache()
    await flush()
    expect(bitmaps.every((b) => b.closed)).toBe(true)
    const drawnBefore = ctx.drawn.length

    expect(() => renderer.render({ ...doc, name: 'After clear' }, options)).not.toThrow()
    await flush()
    // no closed bitmap was drawn, and fresh rasters were started
    expect(ctx.drawn).toHaveLength(drawnBefore)
    expect(frames.length).toBeGreaterThan(0)

    runFrame()
    await flush()
    expect(ctx.drawn).toHaveLength(drawnBefore + 3)
    expect(bitmaps.filter((b) => !b.closed)).toHaveLength(3)
    renderer.dispose()
  })

  it('never hands a closed bitmap to drawImage', async () => {
    const { canvas, ctx } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(128, 128)
    renderer.render(docWithLayers(4), options)
    await flush()
    runFrame()
    await flush()
    for (const source of ctx.drawn) {
      const bitmap = source as FakeBitmap
      expect(bitmap.width).toBeGreaterThan(0)
      expect(bitmap.height).toBeGreaterThan(0)
    }
    renderer.dispose()
  })
})

describe('reserveRasterCache', () => {
  it('is reset by clearRasterCache so a reservation cannot leak between documents', async () => {
    reserveRasterCache(500)
    clearRasterCache()
    const { canvas, ctx } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(128, 128)
    renderer.render(docWithLayers(2), options)
    await flush()
    runFrame()
    await flush()
    expect(ctx.drawn).toHaveLength(2)
    renderer.dispose()
  })

  it('ignores a non-finite reservation', () => {
    expect(() => reserveRasterCache(Number.NaN)).not.toThrow()
    expect(() => reserveRasterCache(-5)).not.toThrow()
  })
})

describe('every rendition, platform and fill kind', () => {
  const fills: Fill[] = [
    { kind: 'none' },
    { kind: 'solid', color: { space: 'srgb', components: [0.2, 0.4, 0.8, 1] } },
    { kind: 'automatic-gradient', color: { space: 'srgb', components: [0.2, 0.4, 0.8, 1] } },
    {
      kind: 'linear-gradient',
      colors: [
        { space: 'srgb', components: [1, 0, 0, 1] },
        { space: 'gray', components: [0.5, 1] },
      ],
      angle: 45,
    },
  ]

  it('paints without throwing, with the layers actually reaching drawImage', async () => {
    const { canvas, ctx } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(256, 256)
    let painted = 0
    for (const fill of fills) {
      const doc: IconDoc = { ...docWithLayers(2), fill: { default: fill } }
      for (const rendition of RENDITIONS) {
        for (const platform of ['ios', 'macos', 'watchos'] as const) {
          const next = { ...options, rendition, platform, pixelRatio: 2 }
          expect(() => renderer.render(doc, next)).not.toThrow()
          await flush()
          while (runFrame()) await flush()
          painted++
        }
      }
    }
    expect(painted).toBe(fills.length * RENDITIONS.length * 3)
    // the sweep is not vacuous: layers were drawn, not skipped
    expect(ctx.drawn.length).toBeGreaterThan(0)
    renderer.dispose()
  })

  it('repaints on a document or option change and skips an identical render', async () => {
    const { canvas, ctx } = fakeCanvas()
    const renderer = createFlatRenderer(canvas)
    renderer.resize(128, 128)
    const doc = docWithLayers(2)
    renderer.render(doc, options)
    await flush()
    runFrame()
    await flush()
    const afterFirst = ctx.drawn.length
    expect(afterFirst).toBe(2)

    // identical render: skipped, nothing new drawn
    renderer.render(doc, options)
    expect(ctx.drawn).toHaveLength(afterFirst)

    // changed document: repainted
    renderer.render({ ...doc, name: 'Other' }, options)
    expect(ctx.drawn).toHaveLength(afterFirst + 2)

    // changed options: repainted
    renderer.render({ ...doc, name: 'Other' }, { ...options, wallpaper: 'gradient-warm' })
    expect(ctx.drawn).toHaveLength(afterFirst + 4)
    renderer.dispose()
  })
})
