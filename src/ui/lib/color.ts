/** Color helpers the inspector needs and `core/export/color` does not provide. */
import { hexToColor } from '@/core/export/color'
import type { Color } from '@/core/model/types'

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

const byte = (n: number): string =>
  Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, '0')

/** `#rrggbb` for `<input type="color">`; alpha is carried separately. */
export const colorToHex = (c: Color): string => {
  const [x = 0, y = 0, z = 0] = c.components
  return c.space === 'gray' ? `#${byte(x)}${byte(x)}${byte(x)}` : `#${byte(x)}${byte(y)}${byte(z)}`
}

export const alphaOf = (c: Color): number =>
  c.space === 'gray' ? (c.components[1] ?? 1) : (c.components[3] ?? 1)

export const withAlpha = (c: Color, alpha: number): Color =>
  c.space === 'gray'
    ? { space: 'gray', components: [c.components[0] ?? 0, alpha] }
    : { ...c, components: [...c.components.slice(0, 3), alpha] }

export const grayColor = (level: number, alpha: number): Color => ({
  space: 'gray',
  components: [level, alpha],
})

/** White level 0..1. An rgb color reports its relative luminance, which is what the Mono
 * appearance is after, so switching a fill between Solid and Gray keeps a sane value. */
export const grayLevel = (c: Color): number => {
  const [x = 0, y = 0, z = 0] = c.components
  return c.space === 'gray' ? x : 0.2126 * x + 0.7152 * y + 0.0722 * z
}

/** The same color in the srgb space: a gray level spreads across all three channels. */
export const toSrgbColor = (c: Color): Color =>
  c.space === 'gray'
    ? {
        space: 'srgb',
        components: [c.components[0] ?? 0, c.components[0] ?? 0, c.components[0] ?? 0, alphaOf(c)],
      }
    : c

/** The same color as a gray: an rgb color collapses to its luminance. */
export const toGrayColor = (c: Color): Color =>
  c.space === 'gray' ? c : grayColor(grayLevel(c), alphaOf(c))

/** Parse a `<input type="color">` value, keeping `alpha`. Junk becomes opaque black. */
export const solidColor = (hex: string, alpha: number): Color =>
  withAlpha(hexToColor(hex) ?? { space: 'srgb', components: [0, 0, 0, 1] }, alpha)
