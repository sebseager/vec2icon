/** Rasterizes a single layer to an ImageBitmap on the 1024 canvas.
 *
 * `layerRenderSvg` and `rasterCacheKey` are pure and unit tested;
 * `rasterizeLayer` touches Blob / Image / OffscreenCanvas and guards every one
 * of them so importing this module never throws outside a browser.
 */
import type { ResolvedLayer } from '../model/appearance'
import { appearanceCacheKey } from '../model/appearance'
import { invert, layerMatrix, type Matrix, matrixToSvg, multiply } from '../model/geometry'
import type { Color, Fill, Layer } from '../model/types'
import { CANVAS_SIZE } from '../model/types'
import { automaticGradientStops, linearGradientVector } from './gradient'

const MASK_ID = 'v2i-layer-mask'
const FILL_ID = 'v2i-layer-fill'
/** Largest raster we ever ask for, per the spec's 2x DPR cap. */
export const MAX_RASTER_SIZE = 2048
const MAX_CACHE_ENTRIES = 64

/** Raster pixel size for a device pixel ratio: 1024 * ratio, capped at 2048. */
export const rasterSizeFor = (pixelRatio: number): number =>
  Math.max(1, Math.min(MAX_RASTER_SIZE, Math.round(CANVAS_SIZE * (pixelRatio || 1))))

const num = (n: number): string => {
  const rounded = Math.round(n * 1e6) / 1e6
  return (rounded === 0 ? 0 : rounded).toString()
}

const channel = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255)

/** CSS color for an SVG paint attribute; alpha is carried separately. */
const colorToCss = (c: Color): string => {
  if (c.space === 'gray') {
    const w = channel(c.components[0] ?? 0)
    return `rgb(${w}, ${w}, ${w})`
  }
  const [r = 0, g = 0, b = 0] = c.components
  if (c.space === 'display-p3') {
    return `color(display-p3 ${num(r)} ${num(g)} ${num(b)})`
  }
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`
}

const colorAlpha = (c: Color): number =>
  (c.space === 'gray' ? c.components[1] : c.components[3]) ?? 1

const stopEl = (offset: number, c: Color): string => {
  const alpha = colorAlpha(c)
  const opacity = alpha === 1 ? '' : ` stop-opacity="${num(alpha)}"`
  return `<stop offset="${offset}" stop-color="${colorToCss(c)}"${opacity}/>`
}

const gradientDef = (stops: [Color, Color], angle: number): string => {
  const v = linearGradientVector(angle)
  return `<linearGradient id="${FILL_ID}" x1="${num(v.x1)}" y1="${num(v.y1)}" x2="${num(v.x2)}" y2="${num(v.y2)}">${stopEl(0, stops[0])}${stopEl(1, stops[1])}</linearGradient>`
}

/** Extra <defs> content plus the paint attributes the fill rect needs. */
const fillPaint = (fill: Fill): { defs: string; attrs: string } => {
  switch (fill.kind) {
    case 'none':
      return { defs: '', attrs: 'fill="none"' }
    case 'solid': {
      const alpha = colorAlpha(fill.color)
      const opacity = alpha === 1 ? '' : ` fill-opacity="${num(alpha)}"`
      return { defs: '', attrs: `fill="${colorToCss(fill.color)}"${opacity}` }
    }
    case 'automatic-gradient':
      return {
        defs: gradientDef(automaticGradientStops(fill.color), 0),
        attrs: `fill="url(#${FILL_ID})"`,
      }
    case 'linear-gradient':
      return {
        defs: gradientDef(fill.colors, fill.angle),
        attrs: `fill="url(#${FILL_ID})"`,
      }
  }
}

const SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}">`

/**
 * A standalone 1024 SVG document for one layer with its matrix baked in.
 * With a fill override the fragment becomes an alpha mask over a filled rect,
 * so the layer's own colors are replaced but its coverage is preserved.
 * Layer opacity is never baked in — the compositor applies it.
 */
export const layerRenderSvg = (layer: Layer, resolved: ResolvedLayer): string => {
  const transform = matrixToSvg(layerMatrix(layer))
  const content = `<g transform="${transform}">${layer.svg}</g>`
  if (resolved.fill === null) {
    const defs = layer.defs ? `<defs>${layer.defs}</defs>` : ''
    return `${SVG_OPEN}${defs}${content}</svg>`
  }
  const paint = fillPaint(resolved.fill)
  const mask = `<mask id="${MASK_ID}" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">${content}</mask>`
  return `${SVG_OPEN}<defs>${layer.defs}${paint.defs}${mask}</defs><rect x="0" y="0" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" ${paint.attrs} mask="url(#${MASK_ID})"/></svg>`
}

/** FNV-1a (32 bit) over a string, as a base-36 digit string. */
const fnv1a = (input: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

/** Cache key over everything that changes the rendered pixels. */
export const rasterCacheKey = (layer: Layer, resolved: ResolvedLayer, size: number): string => {
  const parts = [
    layer.svg,
    layer.defs,
    matrixToSvg(layerMatrix(layer)),
    layer.sourceViewBox.join(','),
    `${layer.bbox.x},${layer.bbox.y},${layer.bbox.width},${layer.bbox.height}`,
    appearanceCacheKey(resolved),
    String(size),
  ]
  const joined = parts.join(' ')
  // two independently seeded passes keep 32-bit collisions unlikely
  return `${fnv1a(joined)}${fnv1a(`${joined.length}${joined}`)}`
}

/** Cache key over everything but where the layer sits: the same markup and appearance
 * at any transform share one base key, so a raster drawn at an older transform can
 * stand in while the exact one is still being drawn. */
export const rasterBaseKey = (layer: Layer, resolved: ResolvedLayer, size: number): string => {
  const joined = [layer.svg, layer.defs, appearanceCacheKey(resolved), String(size)].join(' ')
  return `${fnv1a(joined)}${fnv1a(`${joined.length}${joined}`)}`
}

/**
 * Where a canvas point of the layer placed at `now` fell in a raster drawn while it
 * was placed at `then`: sample the old raster there to show the layer in its new place.
 */
export const staleSourceMatrix = (then: Matrix, now: Matrix): Matrix => multiply(then, invert(now))

type BitmapCanvas = {
  getContext(id: '2d'): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
}

const createRasterCanvas = (size: number): BitmapCanvas | null => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size)
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  return canvas
}

const loadSvgImage = (svg: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    if (
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function' ||
      typeof Image === 'undefined'
    ) {
      reject(new Error('rasterizeLayer requires a browser environment'))
      return
    }
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const image = new Image()
    const done = (fn: () => void) => {
      URL.revokeObjectURL(url)
      fn()
    }
    image.onload = () => done(() => resolve(image))
    image.onerror = () => done(() => reject(new Error('layer svg failed to decode')))
    image.src = url
  })

/**
 * The bitmap is produced with an explicit `premultiplyAlpha: 'premultiply'` so
 * consumers never have to guess: the GL pipeline is premultiplied throughout and
 * `UNPACK_PREMULTIPLY_ALPHA_WEBGL` is ignored for ImageBitmap uploads, while the
 * flat path's `drawImage` handles a premultiplied bitmap correctly either way.
 * Orientation stays y-down (the ImageBitmap default); the GL consumer flips v.
 */
const drawToBitmap = async (svg: string, size: number): Promise<ImageBitmap> => {
  if (typeof createImageBitmap !== 'function') {
    throw new Error('rasterizeLayer requires createImageBitmap')
  }
  const image = await loadSvgImage(svg)
  const canvas = createRasterCanvas(size)
  const ctx = canvas?.getContext('2d')
  if (!ctx) throw new Error('rasterizeLayer could not acquire a 2d context')
  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(image as CanvasImageSource, 0, 0, size, size)
  return createImageBitmap(canvas as unknown as ImageBitmapSource, {
    premultiplyAlpha: 'premultiply',
  })
}

/**
 * `ImageBitmap.close()` zeroes width and height, and drawing a closed bitmap throws
 * InvalidStateError. This module owns every bitmap it hands out and closes them on
 * eviction, so synchronous consumers gate each use on this check.
 */
export const isDrawableBitmap = (bitmap: ImageBitmap): boolean =>
  bitmap.width > 0 && bitmap.height > 0

/** Insertion-ordered LRU of in-flight and finished rasters. */
const cache = new Map<string, Promise<ImageBitmap>>()
/** The subset of `cache` that has resolved, for synchronous `peekRaster` reads. */
const settled = new Map<string, ImageBitmap>()
/** The most recently settled raster per base key, and the matrix it was drawn at. */
const latest = new Map<string, { key: string; matrix: Matrix }>()
let reserved = 0

/**
 * Keep at least `entries` rasters resident. A renderer reserves its document's
 * layer count before painting, so one frame's working set can never be evicted
 * out from under it — without this, a document with more layers than the cache
 * holds would drop a rotating subset of layers and repaint forever.
 */
export const reserveRasterCache = (entries: number): void => {
  reserved = Number.isFinite(entries) ? Math.max(0, Math.floor(entries)) : 0
}

const capacity = (): number => Math.max(MAX_CACHE_ENTRIES, reserved)

const closeLater = (entry: Promise<ImageBitmap>): void => {
  entry.then((bitmap) => bitmap.close?.()).catch(() => undefined)
}

const forget = (key: string): void => {
  const entry = cache.get(key)
  cache.delete(key)
  settled.delete(key)
  for (const [base, stale] of latest) if (stale.key === key) latest.delete(base)
  if (entry) closeLater(entry)
}

const evict = (): void => {
  const limit = capacity()
  while (cache.size > limit) {
    const oldest = cache.keys().next()
    if (oldest.done) return
    forget(oldest.value)
  }
}

/** Move a key to the most-recently-used end of the LRU. */
const touch = (key: string): void => {
  const entry = cache.get(key)
  if (!entry) return
  cache.delete(key)
  cache.set(key, entry)
}

/**
 * The already-rasterized bitmap for a layer, or null when it has not resolved yet
 * or has since been closed. Never starts work — call `rasterizeLayer` for that.
 * Exists so synchronous consumers (the Canvas 2D renderer) need no bitmap cache of
 * their own: this module stays the single owner of bitmap lifetime.
 */
export const peekRaster = (
  layer: Layer,
  resolved: ResolvedLayer,
  size: number,
): ImageBitmap | null => peekRasterByKey(rasterCacheKey(layer, resolved, size))

/** `peekRaster` for a key already in hand, such as one from `latestRaster`. */
export const peekRasterByKey = (key: string): ImageBitmap | null => {
  const bitmap = settled.get(key)
  if (!bitmap) return null
  if (!isDrawableBitmap(bitmap)) {
    cache.delete(key)
    settled.delete(key)
    return null
  }
  touch(key)
  return bitmap
}

/**
 * The newest settled raster of this layer's markup and appearance at any transform,
 * for drawing the layer while the raster at its current transform is still pending.
 */
export const latestRaster = (
  layer: Layer,
  resolved: ResolvedLayer,
  size: number,
): { key: string; matrix: Matrix } | null =>
  latest.get(rasterBaseKey(layer, resolved, size)) ?? null

/** Rasterize a layer at `size` px, memoized by `rasterCacheKey`. */
export const rasterizeLayer = (
  layer: Layer,
  resolved: ResolvedLayer,
  size: number,
): Promise<ImageBitmap> => {
  const key = rasterCacheKey(layer, resolved, size)
  const hit = cache.get(key)
  if (hit) {
    touch(key)
    return hit
  }
  const entry = drawToBitmap(layerRenderSvg(layer, resolved), size)
  const base = rasterBaseKey(layer, resolved, size)
  const matrix = layerMatrix(layer)
  entry
    .then((bitmap) => {
      if (cache.get(key) !== entry) return
      settled.set(key, bitmap)
      latest.set(base, { key, matrix })
    })
    .catch(() => {
      if (cache.get(key) === entry) {
        cache.delete(key)
        settled.delete(key)
      }
    })
  cache.set(key, entry)
  evict()
  return entry
}

/** Drop every cached raster, release its bitmap, and clear the reservation. */
export const clearRasterCache = (): void => {
  for (const entry of cache.values()) closeLater(entry)
  cache.clear()
  settled.clear()
  reserved = 0
}
