/** Luminance mapping used by the Mono appearance and the Clear/Tinted renditions. */
import type { Color, Rendition } from '../model/types'

const linearize = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** Rec. 709 relative luminance of an sRGB-encoded triple (components 0..1). */
export const relativeLuminance = (r: number, g: number, b: number): number =>
  0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)

/** Relative luminance of a model color; gray is achromatic, display-p3 is read as rgb. */
export const colorLuminance = (c: Color): number => {
  if (c.space === 'gray') {
    const w = c.components[0] ?? 0
    return relativeLuminance(w, w, w)
  }
  return relativeLuminance(c.components[0] ?? 0, c.components[1] ?? 0, c.components[2] ?? 0)
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

const white = (alpha: number): Color => ({ space: 'srgb', components: [1, 1, 1, alpha] })

/** Scale the chromatic components of a color, forcing alpha to 1. */
const scaleOpaque = (c: Color, k: number): Color =>
  c.space === 'gray'
    ? { space: 'gray', components: [(c.components[0] ?? 0) * k, 1] }
    : {
        space: c.space,
        components: [
          (c.components[0] ?? 0) * k,
          (c.components[1] ?? 0) * k,
          (c.components[2] ?? 0) * k,
          1,
        ],
      }

/**
 * The color a Mono-luminance sample paints as in a given rendition.
 * Clear renditions paint white glass whose alpha rises with luminance (Clear
 * Dark brighter); Tinted renditions paint the tint scaled by luminance.
 * Default and Dark do not use this mapping and return the tint unchanged.
 */
export const monoColor = (lum: number, rendition: Rendition, tint: Color): Color => {
  const t = Math.min(1, Math.max(0, lum))
  switch (rendition) {
    case 'clearLight':
      return white(lerp(0.55, 0.95, t))
    case 'clearDark':
      return white(lerp(0.7, 1, t))
    case 'tintedLight':
    case 'tintedDark':
      return scaleOpaque(tint, lerp(0.35, 1, t))
    default:
      return tint
  }
}
