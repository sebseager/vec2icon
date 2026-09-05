import type { Color } from '../model/types'

/** Icon Composer writes every color component with exactly 5 decimal places.
 * "extended-*" spaces are unbounded, so components are never clamped here. */
export const formatComponent = (n: number): string => {
  const s = (Number.isFinite(n) ? n : 0).toFixed(5)
  return s === '-0.00000' ? '0.00000' : s
}

/** Wire name Icon Composer writes for each of our color spaces. */
const WIRE_SPACE: Record<Color['space'], string> = {
  srgb: 'extended-srgb',
  'display-p3': 'display-p3',
  gray: 'extended-gray',
}

/** Wire names we accept back, and the component count each one carries. */
const PARSE_SPACE: Record<string, { space: Color['space']; count: number }> = {
  'extended-srgb': { space: 'srgb', count: 4 },
  srgb: { space: 'srgb', count: 4 },
  'display-p3': { space: 'display-p3', count: 4 },
  'extended-gray': { space: 'gray', count: 2 },
  gray: { space: 'gray', count: 2 },
}

/** `extended-srgb:r,g,b,a`, `display-p3:r,g,b,a` or `extended-gray:w,a`. */
export const serializeColor = (c: Color): string =>
  `${WIRE_SPACE[c.space]}:${c.components.map(formatComponent).join(',')}`

const NUMBER_RE = /^-?\d*\.?\d+$/

/** Inverse of `serializeColor`. Returns null for anything malformed, including
 * `named:` system colors, which our model cannot represent. */
export const parseColor = (s: string): Color | null => {
  const colon = s.indexOf(':')
  if (colon < 0) return null
  const entry = PARSE_SPACE[s.slice(0, colon)]
  if (!entry) return null
  const parts = s.slice(colon + 1).split(',')
  if (parts.length !== entry.count) return null
  const components: number[] = []
  for (const part of parts) {
    if (!NUMBER_RE.test(part)) return null
    components.push(Number(part))
  }
  return { space: entry.space, components }
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

const channel255 = (n: number): number => Math.round(clamp01(n) * 255)

/** Up to 5 decimals, trailing zeros trimmed — for CSS, where "1" beats "1.00000". */
const cssNumber = (n: number): string => String(Math.round(n * 1e5) / 1e5)

/** SVG/CSS paint string for a color. */
export const cssColor = (c: Color): string => {
  const [x = 0, y = 0, z = 0, w = 1] = c.components
  if (c.space === 'gray')
    return `rgb(${channel255(x)} ${channel255(x)} ${channel255(x)} / ${cssNumber(clamp01(y))})`
  if (c.space === 'display-p3') {
    return `color(display-p3 ${cssNumber(x)} ${cssNumber(y)} ${cssNumber(z)} / ${cssNumber(clamp01(w))})`
  }
  return `rgb(${channel255(x)} ${channel255(y)} ${channel255(z)} / ${cssNumber(clamp01(w))})`
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** `#rgb`, `#rrggbb` or `#rrggbbaa` (the leading `#` is optional). */
export const hexToColor = (hex: string): Color | null => {
  const match = HEX_RE.exec(hex.trim())
  if (!match?.[1]) return null
  const digits = match[1]
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits
  const byte = (i: number): number => Number.parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255
  return {
    space: 'srgb',
    components: [byte(0), byte(1), byte(2), full.length === 8 ? byte(3) : 1],
  }
}
