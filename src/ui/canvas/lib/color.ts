/** Converting between the model's `Color` and the `<input type="color">` hex form. */
import type { Color } from '@/core/model/types'

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

const byte = (n: number): string =>
  Math.round(clamp01(n) * 255)
    .toString(16)
    .padStart(2, '0')

/** `#rrggbb` for a color; gray expands to a neutral triplet. */
export const colorToHex = (color: Color): string => {
  const [x = 0, y = 0, z = 0] = color.components
  return color.space === 'gray'
    ? `#${byte(x)}${byte(x)}${byte(x)}`
    : `#${byte(x)}${byte(y)}${byte(z)}`
}

const HEX_RE = /^#?([0-9a-f]{6})$/i

/** An sRGB color from `#rrggbb`, black when the string is not one. */
export const hexToColor = (hex: string, alpha = 1): Color => {
  const match = HEX_RE.exec(hex.trim())
  if (!match) return { space: 'srgb', components: [0, 0, 0, alpha] }
  const value = Number.parseInt(match[1] as string, 16)
  return {
    space: 'srgb',
    components: [
      ((value >> 16) & 255) / 255,
      ((value >> 8) & 255) / 255,
      (value & 255) / 255,
      alpha,
    ],
  }
}
