/** Gradient math for the document fill and the preview wallpaper. Pure. */
import type { Color } from '../model/types'
import type { Wallpaper } from './types'

/** Fraction of the remaining headroom the automatic gradient's top stop gains. */
export const AUTO_GRADIENT_LIGHTEN = 0.25
/** Fraction of saturation the automatic gradient's top stop loses. */
export const AUTO_GRADIENT_DESATURATE = 0.15

type Hsl = { h: number; s: number; l: number }

const rgbToHsl = (r: number, g: number, b: number): Hsl => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h, s, l }
}

const hueToRgb = (p: number, q: number, t: number): number => {
  const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

const hslToRgb = ({ h, s, l }: Hsl): [number, number, number] => {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hueToRgb(p, q, h + 1 / 3), hueToRgb(p, q, h), hueToRgb(p, q, h - 1 / 3)]
}

/** rgb triple + alpha of a color, treating gray as an achromatic rgb. */
const toRgba = (c: Color): [number, number, number, number] => {
  if (c.space === 'gray') {
    const w = c.components[0] ?? 0
    return [w, w, w, c.components[1] ?? 1]
  }
  return [c.components[0] ?? 0, c.components[1] ?? 0, c.components[2] ?? 0, c.components[3] ?? 1]
}

/** Rebuild a color in `space` from an rgb triple, keeping the original alpha. */
const fromRgba = (space: Color['space'], rgb: [number, number, number], a: number): Color =>
  space === 'gray'
    ? { space, components: [(rgb[0] + rgb[1] + rgb[2]) / 3, a] }
    : { space, components: [rgb[0], rgb[1], rgb[2], a] }

/**
 * Apple's automatic gradient, approximated: the base color at the bottom and a
 * lighter, slightly desaturated tint at the top. Returned as [bottom, top].
 */
export const automaticGradientStops = (c: Color): [Color, Color] => {
  const [r, g, b, a] = toRgba(c)
  const hsl = rgbToHsl(r, g, b)
  const top = hslToRgb({
    h: hsl.h,
    s: hsl.s * (1 - AUTO_GRADIENT_DESATURATE),
    l: hsl.l + (1 - hsl.l) * AUTO_GRADIENT_LIGHTEN,
  })
  return [c, fromRgba(c.space, top, a)]
}

/**
 * Endpoints of a linear gradient in unit object-bounding-box coordinates
 * (y down). 0 degrees paints bottom to top; angles increase clockwise, so 90
 * paints left to right.
 */
export const linearGradientVector = (
  angleDeg: number,
): { x1: number; y1: number; x2: number; y2: number } => {
  const rad = (angleDeg * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  return { x1: 0.5 - dx / 2, y1: 0.5 - dy / 2, x2: 0.5 + dx / 2, y2: 0.5 + dy / 2 }
}

const rgb = (r: number, g: number, b: number): Color => ({
  space: 'srgb',
  components: [r, g, b, 1],
})

const WALLPAPERS: Record<Exclude<Wallpaper, 'checker'>, [Color, Color]> = {
  light: [rgb(0.878, 0.882, 0.898), rgb(0.973, 0.976, 0.984)],
  dark: [rgb(0.043, 0.047, 0.055), rgb(0.145, 0.153, 0.176)],
  'gradient-blue': [rgb(0.055, 0.118, 0.36), rgb(0.35, 0.62, 0.94)],
  'gradient-warm': [rgb(0.42, 0.129, 0.196), rgb(0.965, 0.686, 0.352)],
}

/** [bottom, top] stops for a wallpaper, or the checker sentinel. */
export const wallpaperStops = (w: Wallpaper): [Color, Color] | 'checker' =>
  w === 'checker' ? 'checker' : WALLPAPERS[w]
