/** The colors a layer paints with, and swapping one of them for another everywhere it appears. */
import type { Color, Layer } from '../model/types'
import { parseCssColor } from './background'
import { parseSvg } from './parse'
import { serializeElement } from './serialize'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Attributes that carry a paint. Styles were flattened onto these at import. */
const PAINT_ATTRIBUTES = ['fill', 'stroke', 'stop-color'] as const

export type LayerColor = {
  /** Identity of the color: "#FFF", "white" and "#ffffff" share one key. */
  key: string
  color: Color
  /** How many attributes paint with it. */
  uses: number
}

const byte = (n: number): string =>
  Math.round(Math.min(1, Math.max(0, n)) * 255)
    .toString(16)
    .padStart(2, '0')

/** `#rrggbb`, or `#rrggbbaa` when the color is not opaque. */
export const colorKey = (color: Color): string => {
  const [r = 0, g = 0, b = 0, a = 1] = color.components
  const rgb = `#${byte(r)}${byte(g)}${byte(b)}`
  return a >= 1 ? rgb : `${rgb}${byte(a)}`
}

const parseFragment = (layer: Pick<Layer, 'svg' | 'defs'>) => {
  const result = parseSvg(`<svg xmlns="${SVG_NS}"><defs>${layer.defs}</defs>${layer.svg}</svg>`)
  if (!result.ok) return null
  const defs = result.root.children[0]
  const group = result.root.children[1]
  return defs && group ? { defs, group } : null
}

const paintedAttributes = (
  root: Element,
): { el: Element; name: (typeof PAINT_ATTRIBUTES)[number]; color: Color }[] => {
  const found: { el: Element; name: (typeof PAINT_ATTRIBUTES)[number]; color: Color }[] = []
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const name of PAINT_ATTRIBUTES) {
      const value = el.getAttribute(name)
      if (value === null) continue
      const color = parseCssColor(value)
      if (color) found.push({ el, name, color })
    }
  }
  return found
}

/** Distinct colors in first-seen order, defs first so gradient stops sit with the artwork. */
export const layerColors = (layer: Pick<Layer, 'svg' | 'defs'>): LayerColor[] => {
  const fragment = parseFragment(layer)
  if (!fragment) return []
  const colors = new Map<string, LayerColor>()
  for (const root of [fragment.group, fragment.defs]) {
    for (const { color } of paintedAttributes(root)) {
      const key = colorKey(color)
      const entry = colors.get(key)
      if (entry) entry.uses += 1
      else colors.set(key, { key, color, uses: 1 })
    }
  }
  return Array.from(colors.values())
}

/** The layer with every paint matching `from` (a `colorKey`) replaced by `to`. Geometry is
 * untouched, so the bounds stay as they were. */
export const recolorLayer = (layer: Layer, from: string, to: Color): Layer => {
  const fragment = parseFragment(layer)
  if (!fragment) return layer
  const replacement = colorKey(to)
  let changed = false
  for (const root of [fragment.group, fragment.defs]) {
    for (const { el, name, color } of paintedAttributes(root)) {
      if (colorKey(color) !== from) continue
      el.setAttribute(name, replacement)
      changed = true
    }
  }
  if (!changed) return layer
  return {
    ...layer,
    svg: serializeElement(fragment.group),
    defs: Array.from(fragment.defs.children)
      .map((el) => serializeElement(el))
      .join(''),
  }
}
