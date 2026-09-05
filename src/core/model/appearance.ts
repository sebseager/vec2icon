/** Per-appearance resolution of layer properties.
 *
 * The Default appearance is the base; Dark and Mono override it per layer.
 * Clear and Tinted renditions read Mono values. A `null` fill means "use the
 * SVG's own colors" — only an explicit override replaces them.
 */
import type { Appearance, BlendMode, Fill, IconDoc, Layer, Rendition } from './types'

export type ResolvedLayer = {
  /** null = the layer keeps the colors baked into its own SVG. */
  fill: Fill | null
  opacity: number
  hidden: boolean
  blendMode: BlendMode
}

/** Base values (Default appearance) merged with the override for `appearance`. */
export const resolveLayer = (layer: Layer, appearance: Appearance): ResolvedLayer => {
  const base: ResolvedLayer = {
    fill: null,
    opacity: layer.opacity,
    hidden: layer.hidden,
    blendMode: layer.blendMode,
  }
  if (appearance === 'default') return base
  const override = layer.overrides[appearance]
  if (!override) return base
  return {
    fill: override.fill ?? null,
    opacity: override.opacity ?? base.opacity,
    hidden: override.hidden ?? base.hidden,
    blendMode: override.blendMode ?? base.blendMode,
  }
}

/** Which appearance's values a rendition reads. */
export const renditionAppearance = (r: Rendition): Appearance => {
  if (r === 'default') return 'default'
  if (r === 'dark') return 'dark'
  return 'mono'
}

/** The document background fill for an appearance; dark falls back to default. */
export const docFill = (doc: IconDoc, appearance: Appearance): Fill =>
  appearance === 'dark' ? (doc.fill.dark ?? doc.fill.default) : doc.fill.default

const colorKey = (fill: Fill): string => {
  switch (fill.kind) {
    case 'none':
      return 'none'
    case 'solid':
      return `solid|${fill.color.space}|${fill.color.components.join(',')}`
    case 'automatic-gradient':
      return `auto|${fill.color.space}|${fill.color.components.join(',')}`
    case 'linear-gradient':
      return `linear|${fill.angle}|${fill.colors
        .map((c) => `${c.space}:${c.components.join(',')}`)
        .join('|')}`
  }
}

/** Stable, order-independent key for the raster cache. */
export const appearanceCacheKey = (r: ResolvedLayer): string =>
  [
    r.fill === null ? 'inherit' : colorKey(r.fill),
    r.opacity,
    r.hidden ? '1' : '0',
    r.blendMode,
  ].join(';')
