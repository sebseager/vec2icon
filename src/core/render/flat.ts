/** Canvas 2D fallback: a flat composite with a drop shadow, no glass effects.
 *
 * Used when WebGL2 is unavailable. The UI is responsible for showing the
 * "Flat preview (WebGL unavailable)" label; this module only reports `kind`.
 */
import type { ResolvedLayer } from '../model/appearance'
import { docFill, resolveLayer } from '../model/appearance'
import { invert, layerMatrix, type Matrix, multiply } from '../model/geometry'
import type { BlendMode, Color, IconDoc, Layer } from '../model/types'
import { CANVAS_SIZE } from '../model/types'
import { automaticGradientStops, linearGradientVector, wallpaperStops } from './gradient'
import { monoColor } from './luminance'
import {
  isDrawableBitmap,
  latestRaster,
  peekRaster,
  peekRasterByKey,
  rasterCacheKey,
  rasterizeLayer,
  rasterSizeFor,
  reserveRasterCache,
} from './raster'
import type { Plate } from './rendition'
import { renditionPlan } from './rendition'
import { platformMaskPath } from './shapes'
import type { Renderer, RenderOptions } from './types'

/** Shadow blur and offset in canvas points. */
const SHADOW_BLUR = 24
const SHADOW_OFFSET = 6
const CHECKER_CELL = 64
/** Single luminance sample the flat path uses for the Mono ramp. */
const MONO_FLAT_LUMINANCE = 0.75
/** Upper bound on one frame's raster working set, reserved before every paint. */
const layerBudget = (doc: IconDoc): number =>
  doc.groups.reduce((total, group) => total + group.layers.length, 0)

const PLATE_FILLS: Record<Exclude<Plate, 'none'>, string> = {
  'clear-light': 'rgba(255, 255, 255, 0.18)',
  'clear-dark': 'rgba(10, 10, 13, 0.3)',
  'tinted-light': 'rgb(235, 235, 240)',
  'tinted-dark': 'rgb(28, 28, 31)',
}

const PLATE_RIMS: Record<Exclude<Plate, 'none'>, string> = {
  'clear-light': 'rgba(255, 255, 255, 0.4)',
  'clear-dark': 'rgba(255, 255, 255, 0.28)',
  'tinted-light': 'rgba(255, 255, 255, 0.5)',
  'tinted-dark': 'rgba(255, 255, 255, 0.18)',
}

/** CSS blend modes matching the model's BlendMode names; the two `plus-*` modes
 *  have no Canvas 2D equivalent and fall back to lighter / multiply. */
const CANVAS_BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'plus-darker': 'multiply',
  'plus-lighter': 'lighter',
}

const cssColor = (c: Color): string => {
  const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255)
  if (c.space === 'gray') {
    const w = to255(c.components[0] ?? 0)
    return `rgba(${w}, ${w}, ${w}, ${c.components[1] ?? 1})`
  }
  const [r = 0, g = 0, b = 0, a = 1] = c.components
  return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${a})`
}

type Ctx2D = CanvasRenderingContext2D

const paintGradient = (
  ctx: Ctx2D,
  size: number,
  stops: [Color, Color],
  angle: number,
): CanvasGradient => {
  const v = linearGradientVector(angle)
  const gradient = ctx.createLinearGradient(v.x1 * size, v.y1 * size, v.x2 * size, v.y2 * size)
  gradient.addColorStop(0, cssColor(stops[0]))
  gradient.addColorStop(1, cssColor(stops[1]))
  return gradient
}

const paintWallpaper = (ctx: Ctx2D, width: number, height: number, options: RenderOptions) => {
  const stops = wallpaperStops(options.wallpaper)
  if (stops === 'checker') {
    const cell = Math.max(4, Math.round((Math.min(width, height) / CANVAS_SIZE) * CHECKER_CELL))
    ctx.fillStyle = 'rgb(247, 247, 250)'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = 'rgb(214, 214, 220)'
    for (let y = 0; y < height; y += cell) {
      for (let x = 0; x < width; x += cell) {
        if ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0) ctx.fillRect(x, y, cell, cell)
      }
    }
    return
  }
  const gradient = ctx.createLinearGradient(0, height, 0, 0)
  gradient.addColorStop(0, cssColor(stops[0]))
  gradient.addColorStop(1, cssColor(stops[1]))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

/** Canvas 2D renderer. Always succeeds when a 2d context is available. */
export const createFlatRenderer = (canvas: HTMLCanvasElement): Renderer => {
  // No bitmap cache lives here: raster.ts owns every bitmap and its lifetime, and
  // `peekRaster` is the synchronous read. A second cache on this side could hold a
  // key raster.ts had already evicted and closed, and — when its bound was below
  // the frame's working set — drop a rotating subset of layers and repaint forever.
  const pending = new Set<string>()

  let disposed = false
  let cssWidth = canvas.width || CANVAS_SIZE
  let cssHeight = canvas.height || CANVAS_SIZE
  let lastDoc: IconDoc | null = null
  let lastOptions: RenderOptions | null = null
  let frame: number | null = null
  /** Canvas 2D keeps its content, so an unchanged render can be skipped outright. */
  let paintedDoc: IconDoc | null = null
  let paintedKey: string | null = null
  let contentDirty = true

  const paintKey = (options: RenderOptions): string =>
    [
      options.rendition,
      options.platform,
      options.wallpaper,
      options.lightAngle,
      options.pixelRatio,
      options.tint.space,
      options.tint.components.join(','),
      options.gesture === true,
      cssWidth,
      cssHeight,
    ].join('|')

  const context = (target: HTMLCanvasElement): Ctx2D | null => {
    if (!target || typeof target.getContext !== 'function') return null
    try {
      return target.getContext('2d')
    } catch {
      return null
    }
  }

  const schedule = (): void => {
    if (disposed || frame !== null) return
    if (typeof requestAnimationFrame !== 'function') return
    frame = requestAnimationFrame(() => {
      frame = null
      if (disposed || !lastDoc || !lastOptions) return
      paint(lastDoc, lastOptions)
    })
  }

  /**
   * The layer's raster if it is ready. Otherwise the newest raster of the same layer
   * at an older transform stands in, with the matrix that carries it to the current
   * one, and the exact one is started; null when there is nothing yet. During a
   * `gesture` the stand-in is drawn without starting anything: the exact raster is
   * only worth drawing once the layer has come to rest.
   */
  const bitmapFor = (
    layer: Layer,
    resolved: ResolvedLayer,
    rasterSize: number,
    gesture: boolean,
  ): { bitmap: ImageBitmap; delta: Matrix | null } | null => {
    const ready = peekRaster(layer, resolved, rasterSize)
    if (ready) return { bitmap: ready, delta: null }
    const key = rasterCacheKey(layer, resolved, rasterSize)
    let standIn: { bitmap: ImageBitmap; delta: Matrix | null } | null = null
    const stale = latestRaster(layer, resolved, rasterSize)
    const old = stale ? peekRasterByKey(stale.key) : null
    if (stale && old) {
      standIn = { bitmap: old, delta: multiply(layerMatrix(layer), invert(stale.matrix)) }
    }
    if (standIn && gesture) return standIn
    if (!pending.has(key)) {
      pending.add(key)
      rasterizeLayer(layer, resolved, rasterSize)
        .then(() => {
          pending.delete(key)
          if (disposed) return
          contentDirty = true
          schedule()
        })
        .catch(() => {
          pending.delete(key)
        })
    }
    return standIn
  }

  /**
   * Resolve every raster the document needs, for a complete export. Always calls
   * `rasterizeLayer` (which is memoized) rather than testing a cache first, so a
   * bitmap closed by `clearRasterCache` is rebuilt instead of silently skipped.
   */
  const ensureRasters = async (doc: IconDoc, options: RenderOptions): Promise<void> => {
    reserveRasterCache(layerBudget(doc))
    const appearance = renditionPlan(options.rendition).appearance
    const rasterSize = rasterSizeFor(options.pixelRatio)
    const jobs: Array<Promise<unknown>> = []
    for (const group of doc.groups) {
      if (group.hidden || group.opacity <= 0) continue
      for (const layer of group.layers) {
        const resolved = resolveLayer(layer, appearance)
        if (resolved.hidden || resolved.opacity <= 0) continue
        jobs.push(rasterizeLayer(layer, resolved, rasterSize).catch(() => undefined))
      }
    }
    await Promise.all(jobs)
  }

  /** Scratch canvas used to recolor a layer for the Mono-driven renditions. */
  let scratch: HTMLCanvasElement | null = null
  const scratchAt = (size: number): { canvas: HTMLCanvasElement; ctx: Ctx2D } | null => {
    if (typeof document === 'undefined') return null
    if (!scratch) scratch = document.createElement('canvas')
    scratch.width = size
    scratch.height = size
    const ctx = context(scratch)
    return ctx ? { canvas: scratch, ctx } : null
  }

  /** Draw the whole icon into a square of `size` px at the origin of `ctx`. */
  const paintIcon = (ctx: Ctx2D, doc: IconDoc, options: RenderOptions, size: number): void => {
    const plan = renditionPlan(options.rendition)
    const scale = size / CANVAS_SIZE
    const rasterSize = rasterSizeFor(options.pixelRatio)
    const mask =
      typeof Path2D === 'undefined' ? null : new Path2D(platformMaskPath(options.platform, size))

    ctx.save()
    if (mask) ctx.clip(mask)

    if (plan.usesDocFill) {
      const fill = docFill(doc, plan.appearance)
      if (fill.kind === 'solid') {
        ctx.fillStyle = cssColor(fill.color)
        ctx.fillRect(0, 0, size, size)
      } else if (fill.kind === 'automatic-gradient') {
        ctx.fillStyle = paintGradient(ctx, size, automaticGradientStops(fill.color), 0)
        ctx.fillRect(0, 0, size, size)
      } else if (fill.kind === 'linear-gradient') {
        ctx.fillStyle = paintGradient(ctx, size, fill.colors, fill.angle)
        ctx.fillRect(0, 0, size, size)
      }
    } else if (plan.plate !== 'none') {
      ctx.fillStyle = PLATE_FILLS[plan.plate]
      ctx.fillRect(0, 0, size, size)
      if (mask) {
        ctx.strokeStyle = PLATE_RIMS[plan.plate]
        ctx.lineWidth = Math.max(1, 3 * scale)
        ctx.stroke(mask)
      }
    }

    for (const group of [...doc.groups].reverse()) {
      if (group.hidden || group.opacity <= 0) continue
      for (const layer of [...group.layers].reverse()) {
        const resolved = resolveLayer(layer, plan.appearance)
        if (resolved.hidden || resolved.opacity <= 0) continue
        const raster = bitmapFor(layer, resolved, rasterSize, options.gesture === true)
        if (!raster || !isDrawableBitmap(raster.bitmap)) continue
        const { bitmap, delta } = raster

        ctx.save()
        ctx.globalAlpha = resolved.opacity * group.opacity
        ctx.globalCompositeOperation = CANVAS_BLEND[resolved.blendMode]
        if (layer.glass && group.glass.shadow.kind !== 'none') {
          ctx.shadowColor = `rgba(0, 0, 0, ${group.glass.shadow.opacity * 0.6})`
          ctx.shadowBlur = SHADOW_BLUR * scale
          ctx.shadowOffsetY = SHADOW_OFFSET * scale
        }
        try {
          // Clear and Tinted renditions recolor the layer through the Mono ramp.
          // Flat has no per-pixel luminance pass, so it uses a single mid sample.
          let source: CanvasImageSource = bitmap
          const recolor = plan.monoFromLuminance ? scratchAt(size) : null
          if (recolor) {
            recolor.ctx.setTransform(1, 0, 0, 1, 0, 0)
            recolor.ctx.clearRect(0, 0, size, size)
            recolor.ctx.globalCompositeOperation = 'source-over'
            recolor.ctx.drawImage(bitmap, 0, 0, size, size)
            recolor.ctx.globalCompositeOperation = 'source-in'
            recolor.ctx.fillStyle = cssColor(
              monoColor(MONO_FLAT_LUMINANCE, options.rendition, options.tint),
            )
            recolor.ctx.fillRect(0, 0, size, size)
            source = recolor.canvas
          }
          if (delta) {
            // an older raster standing in: carry it to where the layer is now
            ctx.transform(delta.a, delta.b, delta.c, delta.d, delta.e * scale, delta.f * scale)
          }
          ctx.drawImage(source, 0, 0, size, size)
        } catch {
          // the bitmap was closed between peekRaster and here: rasterize it again on
          // the next frame rather than tearing down render() / the rAF callback with
          // an InvalidStateError
          contentDirty = true
          schedule()
        }
        ctx.restore()
      }
    }
    ctx.restore()
  }

  const paint = (doc: IconDoc, options: RenderOptions): void => {
    if (disposed) return
    const key = paintKey(options)
    if (!contentDirty && doc === paintedDoc && key === paintedKey) return
    const ctx = context(canvas)
    if (!ctx) return
    reserveRasterCache(layerBudget(doc))
    paintedDoc = doc
    paintedKey = key
    contentDirty = false
    const ratio = options.pixelRatio || 1
    const width = Math.max(1, Math.round(cssWidth * ratio))
    const height = Math.max(1, Math.round(cssHeight * ratio))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const size = Math.max(1, Math.min(width, height))

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    paintWallpaper(ctx, width, height, options)

    ctx.save()
    ctx.translate(Math.round((width - size) / 2), Math.round((height - size) / 2))
    paintIcon(ctx, doc, options, size)
    ctx.restore()
  }

  const renderer: Renderer = {
    kind: 'flat',
    render(doc, options) {
      lastDoc = doc
      lastOptions = options
      paint(doc, options)
    },
    async toBlob(doc, options, size) {
      const target = Math.max(1, Math.round(size))
      if (typeof document === 'undefined') throw new Error('toBlob requires a browser environment')
      await ensureRasters(doc, options)
      const temp = document.createElement('canvas')
      temp.width = target
      temp.height = target
      const ctx = context(temp)
      if (!ctx) throw new Error('toBlob could not acquire a 2d context')
      // the exported PNG is an icon image, never a screenshot of the preview: no
      // wallpaper, and the platform clip leaves everything outside it transparent
      paintIcon(ctx, doc, options, target)
      return new Promise<Blob>((resolve, reject) => {
        temp.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
          'image/png',
        )
      })
    },
    resize(width, height) {
      cssWidth = Math.max(1, width)
      cssHeight = Math.max(1, height)
      contentDirty = true
      if (lastDoc && lastOptions) paint(lastDoc, lastOptions)
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      frame = null
      pending.clear()
      lastDoc = null
      lastOptions = null
    },
  }

  return renderer
}
