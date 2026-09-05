import { docFill, resolveLayer } from '../model/appearance'
import { layerMatrix, matrixToSvg } from '../model/geometry'
import type { BlendMode, Fill, IconDoc, Layer, Platform } from '../model/types'
import { CANVAS_SIZE } from '../model/types'
import { automaticGradientStops, linearGradientVector } from '../render/gradient'
import { platformMaskPath } from '../render/shapes'
import { prefixIds } from '../svg/ids'
import { cssColor } from './color'

export type CombinedOptions = {
  background: boolean
  appearance?: 'default' | 'dark'
  /** Clip the whole icon — background included — to this platform's mask. */
  platform?: Platform
}

/** Id of the platform clip path; `l{n}-` layer prefixes cannot collide with it. */
const PLATFORM_CLIP_ID = 'platform-mask'

/** Up to 5 decimals, trailing zeros trimmed. */
const num = (n: number): string => String(Math.round(n * 1e5) / 1e5)

const gradientDefs = (id: string, angle: number, stops: [string, string]): string => {
  const { x1, y1, x2, y2 } = linearGradientVector(angle)
  return `<linearGradient id="${id}" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}"><stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient>`
}

/** An SVG paint string for a `Fill`, plus any `<defs>` content it needs.
 * `paint` is null for `none`. */
const fillPaint = (fill: Fill, id: string): { defs: string; paint: string | null } => {
  switch (fill.kind) {
    case 'none':
      return { defs: '', paint: null }
    case 'solid':
      return { defs: '', paint: cssColor(fill.color) }
    case 'linear-gradient':
      return {
        defs: gradientDefs(id, fill.angle, [cssColor(fill.colors[0]), cssColor(fill.colors[1])]),
        paint: `url(#${id})`,
      }
    case 'automatic-gradient': {
      const [bottom, top] = automaticGradientStops(fill.color)
      return {
        defs: gradientDefs(id, 0, [cssColor(bottom), cssColor(top)]),
        paint: `url(#${id})`,
      }
    }
  }
}

const canvasRect = (paint: string, extra = ''): string =>
  `<rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" fill="${paint}"${extra}/>`

/** `<defs>` content and the full-canvas `<rect>` painting a document background.
 * Both are empty strings for a `none` fill. */
export const backgroundMarkup = (fill: Fill, id: string): { defs: string; rect: string } => {
  const { defs, paint } = fillPaint(fill, id)
  return { defs, rect: paint === null ? '' : canvasRect(paint) }
}

/** Wrap `content` in a `<g>` carrying opacity / blend mode, or return it as-is
 * when both are at their defaults. */
const wrap = (content: string, opacity: number, blendMode: BlendMode): string => {
  const attrs =
    (opacity !== 1 ? ` opacity="${num(opacity)}"` : '') +
    (blendMode !== 'normal' ? ` style="mix-blend-mode:${blendMode}"` : '')
  return attrs === '' ? content : `<g${attrs}>${content}</g>`
}

/** Stable per-layer id prefix, assigned in document order so it does not shift
 * with paint order or hidden layers. */
const layerPrefixes = (doc: IconDoc): Map<string, string> => {
  const prefixes = new Map<string, string>()
  let n = 0
  for (const group of doc.groups) {
    for (const layer of group.layers) {
      prefixes.set(layer.id, `l${n}-`)
      n += 1
    }
  }
  return prefixes
}

/** One flattened SVG of the whole icon, for preview and PNG rasterization.
 * Paint order is bottom-most group and layer first (the reverse of the
 * document's top-most-first order). Hidden groups and layers are skipped. */
export const combinedSvg = (doc: IconDoc, opts: CombinedOptions): string => {
  const appearance = opts.appearance === 'dark' ? 'dark' : 'default'
  const prefixes = layerPrefixes(doc)
  const defs: string[] = []
  const body: string[] = []

  if (opts.background) {
    const bg = backgroundMarkup(docFill(doc, appearance), 'bg')
    if (bg.defs) defs.push(bg.defs)
    if (bg.rect) body.push(bg.rect)
  }

  const renderLayer = (layer: Layer): string | null => {
    const resolved = resolveLayer(layer, appearance)
    if (resolved.hidden) return null

    // A `none` fill override paints nothing at all, matching both the icon.json
    // `"none"` keyword and the renderer's `fill="none"`.
    const fill = resolved.fill
    if (fill?.kind === 'none') return null

    const prefix = prefixes.get(layer.id) ?? ''
    const prefixed = prefixIds(layer.svg, layer.defs, prefix)
    if (prefixed.defs) defs.push(prefixed.defs)

    let content = `<g transform="${matrixToSvg(layerMatrix(layer))}">${prefixed.svg}</g>`

    // Any other fill override recolors the whole layer: punch it out as a mask
    // and paint the fill through it, replacing the layer's own colors. The mask
    // reads coverage, not luminance, so it must be an alpha mask.
    if (fill) {
      const paint = fillPaint(fill, `${prefix}fill`)
      if (paint.defs) defs.push(paint.defs)
      const maskId = `${prefix}fill-mask`
      defs.push(`<mask id="${maskId}" style="mask-type:alpha"><g fill="#fff">${content}</g></mask>`)
      content = canvasRect(paint.paint ?? 'none', ` mask="url(#${maskId})"`)
    }

    return wrap(content, resolved.opacity, resolved.blendMode)
  }

  for (const group of [...doc.groups].reverse()) {
    if (group.hidden) continue
    const parts: string[] = []
    for (const layer of [...group.layers].reverse()) {
      const rendered = renderLayer(layer)
      if (rendered !== null) parts.push(rendered)
    }
    if (parts.length === 0) continue
    body.push(wrap(parts.join(''), group.opacity, group.blendMode))
  }

  // The approximate-glass PNG comes off the renderer already cut to the icon
  // silhouette; clipping here is what makes the glassless one the same shape.
  let content = body.join('')
  if (opts.platform) {
    defs.push(
      `<clipPath id="${PLATFORM_CLIP_ID}"><path d="${platformMaskPath(opts.platform, CANVAS_SIZE)}"/></clipPath>`,
    )
    content = `<g clip-path="url(#${PLATFORM_CLIP_ID})">${content}</g>`
  }

  const defsMarkup = defs.length > 0 ? `<defs>${defs.join('')}</defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">${defsMarkup}${content}</svg>`
}
