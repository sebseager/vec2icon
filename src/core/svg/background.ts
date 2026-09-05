import { type Matrix, multiply } from '../model/geometry'
import type { Color, Fill, Layer } from '../model/types'
import { elementBBox, measureBBox, parseTransform } from './bbox'
import { collectDefs } from './defs'
import { parseSvg } from './parse'
import { serializeElement } from './serialize'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** Shapes that can plausibly be an icon backdrop. */
const BACKGROUND_SHAPES = new Set(['rect', 'circle', 'path'])
/** Containers we descend into while looking for the bottom-most shape. */
const CONTAINERS = new Set(['g', 'svg', 'a'])
/** Elements that define rather than draw, so they never hide the bottom-most shape. */
const NON_DRAWING = new Set([
  'defs',
  'clippath',
  'mask',
  'symbol',
  'marker',
  'pattern',
  'filter',
  'lineargradient',
  'radialgradient',
  'style',
  'title',
  'desc',
  'metadata',
  'script',
])

const MIN_COVERAGE = 0.9
const MIN_ASPECT = 0.9
const MAX_ASPECT = 1.1

const round = (n: number): number => Math.round(n * 10000) / 10000

const NAMED_COLORS: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  lime: [0, 255, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  aqua: [0, 255, 255],
  magenta: [255, 0, 255],
  fuchsia: [255, 0, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  navy: [0, 0, 128],
  teal: [0, 128, 128],
}

const srgb = (r: number, g: number, b: number, a = 1): Color => ({
  space: 'srgb',
  components: [round(r), round(g), round(b), round(a)],
})

const expandHex = (hex: string): string =>
  hex.length === 3 || hex.length === 4
    ? hex
        .split('')
        .map((c) => c + c)
        .join('')
    : hex

/** Parse a CSS colour into an sRGB `Color`; null for `none`, gradients and anything unknown. */
const parseColor = (value: string): Color | null => {
  const text = value.trim().toLowerCase()
  if (!text || text === 'none' || text === 'transparent' || text === 'currentcolor') return null

  if (text.startsWith('#')) {
    const hex = expandHex(text.slice(1))
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) return null
    const channel = (i: number) => Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255
    return srgb(channel(0), channel(1), channel(2), hex.length === 8 ? channel(3) : 1)
  }

  const rgb = /^rgba?\(([^)]*)\)$/.exec(text)
  if (rgb?.[1]) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean)
    const [r, g, b, a] = parts
    if (r === undefined || g === undefined || b === undefined) return null
    // channels are 0..255 or a percentage; alpha is 0..1 or a percentage
    const channel = (part: string) =>
      part.endsWith('%') ? Number.parseFloat(part) / 100 : Number.parseFloat(part) / 255
    const alpha = (part: string) =>
      part.endsWith('%') ? Number.parseFloat(part) / 100 : Number.parseFloat(part)
    const [cr, cg, cb] = [channel(r), channel(g), channel(b)]
    if (![cr, cg, cb].every(Number.isFinite)) return null
    return srgb(cr, cg, cb, a === undefined ? 1 : alpha(a))
  }

  const named = NAMED_COLORS[text]
  return named ? srgb(named[0] / 255, named[1] / 255, named[2] / 255) : null
}

const findById = (root: Element, id: string): Element | null => {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    if (el.getAttribute('id') === id) return el
  }
  return null
}

const hrefTarget = (root: Element, el: Element): Element | null => {
  const href = el.getAttributeNS(null, 'href') ?? el.getAttributeNS(XLINK_NS, 'href')
  return href?.startsWith('#') ? findById(root, href.slice(1)) : null
}

/** Walk the gradient's `href` chain until the attribute is found. */
const inherited = (root: Element, el: Element, name: string): string | null => {
  let current: Element | null = el
  for (let depth = 0; current && depth < 8; depth++) {
    const value = current.getAttribute(name)
    if (value !== null) return value
    current = hrefTarget(root, current)
  }
  return null
}

const gradientStops = (root: Element, el: Element): Element[] => {
  let current: Element | null = el
  for (let depth = 0; current && depth < 8; depth++) {
    const stops = Array.from(current.children).filter((child) => child.localName === 'stop')
    if (stops.length > 0) return stops
    current = hrefTarget(root, current)
  }
  return []
}

const coordinate = (value: string | null, fallback: number): number => {
  if (value === null) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Degrees clockwise from "bottom to top". */
const gradientAngle = (x1: number, y1: number, x2: number, y2: number): number => {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return 0
  const up = dy === 0 ? 0 : -dy
  const degrees = (Math.atan2(dx, up) * 180) / Math.PI
  return round(((degrees % 360) + 360) % 360)
}

const stopColor = (stop: Element): Color | null => {
  const color = parseColor(stop.getAttribute('stop-color') ?? '')
  if (!color) return null
  const opacity = Number.parseFloat(stop.getAttribute('stop-opacity') ?? '')
  if (Number.isFinite(opacity)) {
    return { ...color, components: [...color.components.slice(0, 3), round(opacity)] }
  }
  return color
}

const gradientFill = (root: Element, id: string): Fill | null => {
  const el = findById(root, id)
  if (el?.localName !== 'linearGradient') return null
  const stops = gradientStops(root, el)
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (stops.length < 2 || !first || !last) return null
  const from = stopColor(first)
  const to = stopColor(last)
  if (!from || !to) return null
  return {
    kind: 'linear-gradient',
    colors: [from, to],
    angle: gradientAngle(
      coordinate(inherited(root, el, 'x1'), 0),
      coordinate(inherited(root, el, 'y1'), 0),
      coordinate(inherited(root, el, 'x2'), 1),
      coordinate(inherited(root, el, 'y2'), 0),
    ),
  }
}

/** The shape's own `fill`, or the nearest one it inherits from an ancestor in the fragment. */
const effectiveFill = (el: Element): string => {
  let current: Element | null = el
  while (current && current.localName !== 'svg') {
    const value = (current.getAttribute('fill') ?? '').trim()
    if (value) return value
    current = current.parentElement
  }
  return ''
}

const shapeFill = (root: Element, el: Element): Fill | null => {
  const raw = effectiveFill(el)
  if (!raw) return null
  const reference = /^url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)$/.exec(raw)
  if (reference?.[1]) return gradientFill(root, reference[1])
  const color = parseColor(raw)
  return color ? { kind: 'solid', color } : null
}

/** The bottom-most shape in paint order, with the matrix of its ancestors. */
const bottomMostShape = (
  container: Element,
  base: Matrix,
): { element: Element; parentMatrix: Matrix } | null => {
  for (const child of Array.from(container.children)) {
    const name = child.localName.toLowerCase()
    if (NON_DRAWING.has(name)) continue
    if (BACKGROUND_SHAPES.has(name)) return { element: child, parentMatrix: base }
    if (CONTAINERS.has(name)) {
      const inner = bottomMostShape(
        child,
        multiply(base, parseTransform(child.getAttribute('transform'))),
      )
      if (inner) return inner
      continue
    }
    return null // some other drawable sits at the bottom: not a background
  }
  return null
}

type Analysis = { root: SVGSVGElement; group: Element; element: Element; fill: Fill | null }

const analyze = (layer: Layer): Analysis | null => {
  const result = parseSvg(`<svg xmlns="${SVG_NS}"><defs>${layer.defs}</defs>${layer.svg}</svg>`)
  if (!result.ok) return null
  const root = result.root
  const group = root.children[1]
  if (!group) return null

  const found = bottomMostShape(group, parseTransform(group.getAttribute('transform')))
  if (!found) return null

  const box = elementBBox(found.element, found.parentMatrix)
  if (!box) return null

  const [, , viewWidth, viewHeight] = layer.sourceViewBox
  const area = viewWidth * viewHeight
  if (area <= 0 || box.width * box.height < MIN_COVERAGE * area) return null

  const aspect = box.height === 0 ? Number.POSITIVE_INFINITY : box.width / box.height
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return null

  return { root, group, element: found.element, fill: shapeFill(root, found.element) }
}

/** The layer's backdrop shape, if it has one, together with the `Fill` it can become. */
export const detectBackground = (layer: Layer): { element: Element; fill: Fill | null } | null => {
  const analysis = analyze(layer)
  return analysis ? { element: analysis.element, fill: analysis.fill } : null
}

export const backgroundFill = (layer: Layer): Fill | null => detectBackground(layer)?.fill ?? null

/** Drop the backdrop shape and re-measure. Layers without one are returned as they are. */
export const removeBackground = (layer: Layer): Layer => {
  const analysis = analyze(layer)
  if (!analysis) return layer
  analysis.element.parentNode?.removeChild(analysis.element)
  const svg = serializeElement(analysis.group)
  // the removed shape may have been the only user of a gradient or clip
  const defs = collectDefs(analysis.root, analysis.group)
  return { ...layer, svg, defs, bbox: measureBBox(svg, defs, layer.sourceViewBox) }
}
