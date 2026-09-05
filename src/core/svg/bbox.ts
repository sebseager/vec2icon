import {
  IDENTITY,
  type Matrix,
  multiply,
  rotate,
  scale,
  transformBBox,
  translate,
} from '../model/geometry'
import type { BBox, ViewBox } from '../model/types'

export type Measurer = (svg: string, defs: string, viewBox: ViewBox) => BBox | null

const SVG_NS = 'http://www.w3.org/2000/svg'

const wrap = (svg: string, defs: string, viewBox: ViewBox): string =>
  `<svg xmlns="${SVG_NS}" viewBox="${viewBox.join(' ')}"><defs>${defs}</defs>${svg}</svg>`

const parseFragment = (markup: string): SVGSVGElement | null => {
  try {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
    if (doc.querySelector('parsererror')) return null
    const root = doc.documentElement
    return root && root.localName === 'svg' ? (root as unknown as SVGSVGElement) : null
  } catch {
    return null
  }
}

// --- transform attribute -----------------------------------------------------

const NUMBERS = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g
const TRANSFORM_FUNCTION = /([a-zA-Z]+)\s*\(([^)]*)\)/g

const numbers = (text: string): number[] =>
  (text.match(NUMBERS) ?? []).map(Number).filter(Number.isFinite)

/** Parse an SVG `transform` attribute. skewX/skewY are treated as identity. */
export const parseTransform = (value: string | null): Matrix => {
  if (!value) return IDENTITY
  let result = IDENTITY
  for (const match of value.matchAll(TRANSFORM_FUNCTION)) {
    const name = (match[1] ?? '').toLowerCase()
    const args = numbers(match[2] ?? '')
    let m: Matrix = IDENTITY
    if (name === 'translate') m = translate(args[0] ?? 0, args[1] ?? 0)
    else if (name === 'scale') m = scale(args[0] ?? 1, args[1] ?? args[0] ?? 1)
    else if (name === 'rotate') {
      const [angle = 0, cx, cy] = args
      m =
        cx === undefined || cy === undefined
          ? rotate(angle)
          : multiply(multiply(translate(cx, cy), rotate(angle)), translate(-cx, -cy))
    } else if (name === 'matrix' && args.length >= 6) {
      const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = args
      m = { a, b, c, d, e, f }
    }
    result = multiply(result, m)
  }
  return result
}

// --- pure geometry -----------------------------------------------------------

const num = (el: Element, name: string, fallback = 0): number => {
  const raw = el.getAttribute(name)
  if (raw === null) return fallback
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : fallback
}

const boxOfPoints = (points: { x: number; y: number }[]): BBox | null => {
  if (points.length === 0) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

const PATH_TOKEN = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g

/** Argument count per path command; Z takes none. */
const PATH_ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
}

/**
 * Points that conservatively bound a path: every on-curve point plus the control
 * points of curve segments (a Bezier never leaves its control hull).
 */
const pathPoints = (d: string): { x: number; y: number }[] => {
  const tokens = Array.from(d.matchAll(PATH_TOKEN))
  const points: { x: number; y: number }[] = []
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  let command = ''
  let index = 0

  const push = (px: number, py: number): void => {
    points.push({ x: px, y: py })
  }

  while (index < tokens.length) {
    const token = tokens[index]
    if (!token) break
    if (token[1]) {
      command = token[1]
      index += 1
      if (command.toLowerCase() === 'z') {
        x = startX
        y = startY
        push(x, y)
        continue
      }
    } else if (!command) {
      index += 1
      continue
    }
    const lower = command.toLowerCase()
    const relative = command === lower // lowercase commands are relative
    const arity = PATH_ARITY[lower] ?? 0
    const args: number[] = []
    while (args.length < arity && index < tokens.length) {
      const arg = tokens[index]
      if (!arg || arg[1]) break
      args.push(Number(arg[2]))
      index += 1
    }
    if (args.length < arity) break

    const ax = (i: number): number => (relative ? x : 0) + (args[i] ?? 0)
    const ay = (i: number): number => (relative ? y : 0) + (args[i] ?? 0)

    if (lower === 'm' || lower === 'l') {
      x = ax(0)
      y = ay(1)
      push(x, y)
      if (lower === 'm') {
        startX = x
        startY = y
        command = relative ? 'l' : 'L' // subsequent pairs are implicit lineto
      }
    } else if (lower === 'h') {
      x = ax(0)
      push(x, y)
    } else if (lower === 'v') {
      y = ay(0)
      push(x, y)
    } else if (lower === 'c') {
      push(ax(0), ay(1))
      push(ax(2), ay(3))
      x = ax(4)
      y = ay(5)
      push(x, y)
    } else if (lower === 's' || lower === 'q') {
      push(ax(0), ay(1))
      x = ax(2)
      y = ay(3)
      push(x, y)
    } else if (lower === 't') {
      x = ax(0)
      y = ay(1)
      push(x, y)
    } else if (lower === 'a') {
      x = ax(5)
      y = ay(6)
      push(x, y)
    }
  }
  return points
}

const shapePoints = (el: Element): { x: number; y: number }[] | null => {
  switch (el.localName) {
    case 'rect':
    case 'image': {
      const w = num(el, 'width')
      const h = num(el, 'height')
      if (w <= 0 || h <= 0) return null
      const x = num(el, 'x')
      const y = num(el, 'y')
      return [
        { x, y },
        { x: x + w, y: y + h },
      ]
    }
    case 'circle': {
      const r = num(el, 'r')
      if (r <= 0) return null
      const cx = num(el, 'cx')
      const cy = num(el, 'cy')
      return [
        { x: cx - r, y: cy - r },
        { x: cx + r, y: cy + r },
      ]
    }
    case 'ellipse': {
      const rx = num(el, 'rx')
      const ry = num(el, 'ry')
      if (rx <= 0 || ry <= 0) return null
      const cx = num(el, 'cx')
      const cy = num(el, 'cy')
      return [
        { x: cx - rx, y: cy - ry },
        { x: cx + rx, y: cy + ry },
      ]
    }
    case 'line':
      return [
        { x: num(el, 'x1'), y: num(el, 'y1') },
        { x: num(el, 'x2'), y: num(el, 'y2') },
      ]
    case 'polyline':
    case 'polygon': {
      const coordinates = numbers(el.getAttribute('points') ?? '')
      const points: { x: number; y: number }[] = []
      for (let i = 0; i + 1 < coordinates.length; i += 2) {
        points.push({ x: coordinates[i] ?? 0, y: coordinates[i + 1] ?? 0 })
      }
      return points.length > 0 ? points : null
    }
    case 'path': {
      const points = pathPoints(el.getAttribute('d') ?? '')
      return points.length > 0 ? points : null
    }
    default:
      return null
  }
}

const union = (a: BBox | null, b: BBox | null): BBox | null => {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

const NON_RENDERING = new Set([
  'defs',
  'clippath',
  'mask',
  'symbol',
  'metadata',
  'title',
  'desc',
  'style',
  'script',
  'filter',
  'marker',
  'pattern',
  'lineargradient',
  'radialgradient',
])

/**
 * Bounding box of an element and its descendants in the coordinate system `base`
 * maps into. `<use>` and `<text>` contribute nothing — their geometry needs a
 * layout engine. Returns null when nothing measurable is found.
 */
export const elementBBox = (el: Element, base: Matrix = IDENTITY): BBox | null => {
  const name = el.localName.toLowerCase()
  if (NON_RENDERING.has(name)) return null
  const local = multiply(base, parseTransform(el.getAttribute('transform')))
  const points = shapePoints(el)
  let box = points ? transformBBox(local, boxOfPoints(points) as BBox) : null
  for (const child of Array.from(el.children)) box = union(box, elementBBox(child, local))
  return box
}

// --- measurers ---------------------------------------------------------------

/** Measure by mounting the fragment and asking the browser. */
export const domMeasurer: Measurer = (svg, defs, viewBox) => {
  const root = parseFragment(wrap(svg, defs, viewBox))
  if (!root) return null
  const host = document.createElement('div')
  host.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden')
  try {
    host.appendChild(root)
    document.body.appendChild(host)
    const target = root.children[1]
    const getBBox = (target as unknown as { getBBox?: () => DOMRect } | undefined)?.getBBox
    if (typeof getBBox !== 'function') return null
    const box = getBBox.call(target)
    if (!box || (box.width === 0 && box.height === 0)) return null
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  } catch {
    return null
  } finally {
    host.parentNode?.removeChild(host)
  }
}

/** Measure by walking the geometry ourselves — no layout engine required. */
export const pureMeasurer: Measurer = (svg, defs, viewBox) => {
  const root = parseFragment(wrap(svg, defs, viewBox))
  if (!root) return null
  let box: BBox | null = null
  for (const child of Array.from(root.children)) {
    if (child.localName === 'defs') continue
    box = union(box, elementBBox(child))
  }
  return box
}

const viewBoxBBox = (viewBox: ViewBox): BBox => ({
  x: viewBox[0],
  y: viewBox[1],
  width: viewBox[2],
  height: viewBox[3],
})

let injectedMeasurer: Measurer | null = null

/** Test/injection hook: replace the head of the default measurer chain. */
export const setDefaultMeasurer = (m: Measurer | null): void => {
  injectedMeasurer = m
}

/**
 * Best available bounding box in source user units. An explicit or injected
 * measurer is used alone; otherwise the DOM measurer falls back to the pure one.
 * The viewBox is the last resort so a layer always has a usable box.
 */
export const measureBBox = (
  svg: string,
  defs: string,
  viewBox: ViewBox,
  measurer?: Measurer,
): BBox => {
  const chain = measurer
    ? [measurer]
    : injectedMeasurer
      ? [injectedMeasurer]
      : [domMeasurer, pureMeasurer]
  for (const m of chain) {
    try {
      const box = m(svg, defs, viewBox)
      if (box) return box
    } catch {
      // try the next measurer
    }
  }
  return viewBoxBBox(viewBox)
}
