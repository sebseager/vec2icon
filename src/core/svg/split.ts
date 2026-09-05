import { createLayer, identityTransform, isIdentityTransform } from '../model/defaults'
import { layerCanvasBBox, layerMatrix, matrixToSvg } from '../model/geometry'
import type { BBox, Layer, ViewBox } from '../model/types'
import { CANVAS_SIZE } from '../model/types'
import { measureBBox } from './bbox'
import { collectDefs } from './defs'
import { prefixIds } from './ids'
import { parseSvg } from './parse'
import { sanitizeElement } from './sanitize'
import { serializeElement } from './serialize'
import { PRESENTATION_PROPERTIES } from './styles'

const SVG_NS = 'http://www.w3.org/2000/svg'
const INKSCAPE_NS = 'http://www.inkscape.org/namespaces/inkscape'

/**
 * Presentation attributes an `<svg>` or `<g>` hands down to the children we lift out of it.
 * `display`/`visibility` are excluded: hiding the source document must not hide every layer
 * we extract from it. `transform` and `opacity` are carried separately, because they compose
 * rather than overwrite — and `opacity` is not inherited at all: it composites a subtree as a
 * single unit, so copying it onto each child would double-darken wherever they overlap.
 */
const CARRIED_PRESENTATION = PRESENTATION_PROPERTIES.filter(
  (property) =>
    property !== 'transform' &&
    property !== 'display' &&
    property !== 'visibility' &&
    property !== 'opacity',
)

/** Elements that carry no artwork and never become a layer. */
const NON_RENDERABLE = new Set(['defs', 'metadata', 'title', 'desc', 'style', 'script'])

export const isRenderable = (el: Element): boolean => {
  if (el?.nodeType !== 1) return false
  if (el.namespaceURI !== null && el.namespaceURI !== SVG_NS) return false
  return !NON_RENDERABLE.has(el.localName.toLowerCase())
}

const directTitle = (el: Element): string | null => {
  for (const child of Array.from(el.children)) {
    if (child.localName === 'title') {
      const text = (child.textContent ?? '').trim()
      if (text) return text
    }
  }
  return null
}

/** `index` is the element's 0-based position in paint order. */
export const layerName = (el: Element, index: number): string => {
  const id = el.getAttribute('id')?.trim()
  if (id) return id
  const title = directTitle(el)
  if (title) return title
  const label = (
    el.getAttributeNS(INKSCAPE_NS, 'label') ??
    el.getAttribute('inkscape:label') ??
    ''
  ).trim()
  if (label) return label
  return `Layer ${index + 1}`
}

/** `opacity` is the container opacity lifted off the wrapper; the importer folds it into the layer. */
export type SplitLayer = { name: string; svg: string; defs: string; opacity: number }
export type SplitGroup = { kind: 'group'; name: string; layers: SplitLayer[] }
export type SplitItem = { kind: 'layer'; layer: SplitLayer } | SplitGroup

const renderableChildren = (el: Element): Element[] =>
  Array.from(el.children).filter((child) => isRenderable(child))

/** The presentation attributes `el` would have passed down to its children. */
const carriedAttributes = (el: Element): Record<string, string> => {
  const carried: Record<string, string> = {}
  for (const property of CARRIED_PRESENTATION) {
    const value = el.getAttribute(property)
    if (value !== null) carried[property] = value
  }
  return carried
}

/** A container's own `opacity`, as a 0..1 multiplier. */
const readOpacity = (el: Element): number => {
  const raw = el.getAttribute('opacity')?.trim()
  if (!raw) return 1
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, raw.endsWith('%') ? value / 100 : value))
}

/** Chain transform lists outermost-first, dropping the empty ones. */
const joinTransforms = (...parts: (string | null)[]): string | null => {
  const list = parts.filter((part): part is string => part !== null && part.trim() !== '')
  return list.length > 0 ? list.join(' ') : null
}

const applyWrapperAttributes = (
  g: Element,
  transform: string | null,
  attributes: Record<string, string>,
): void => {
  if (transform) g.setAttribute('transform', transform)
  for (const [name, value] of Object.entries(attributes)) g.setAttribute(name, value)
}

/**
 * Move `children` into a fresh `<g>` placed where the first child was, so the
 * fragment stays inside the document and `collectDefs` can still see the rest of it.
 */
const wrapInGroup = (
  children: Element[],
  transform: string | null,
  attributes: Record<string, string> = {},
): Element => {
  const first = children[0]
  if (!first) throw new Error('wrapInGroup needs at least one child')
  const doc = first.ownerDocument
  const g = doc.createElementNS(SVG_NS, 'g')
  applyWrapperAttributes(g, transform, attributes)
  first.parentNode?.insertBefore(g, first)
  for (const child of children) g.appendChild(child)
  return g
}

const toSplitLayer = (
  root: SVGSVGElement,
  g: Element,
  name: string,
  opacity: number,
): SplitLayer => ({
  name,
  svg: serializeElement(g),
  defs: collectDefs(root, g),
  opacity,
})

const readViewBoxAttribute = (el: Element): ViewBox | null => {
  const parts = (el.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const [x, y, w, h] = parts
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null
  if (x === undefined || y === undefined || w === undefined || h === undefined) return null
  return w > 0 && h > 0 ? [x, y, w, h] : null
}

const length = (el: Element, name: string, fallback: number): number => {
  const value = Number.parseFloat(el.getAttribute(name) ?? '')
  return Number.isFinite(value) ? value : fallback
}

/** The transform that places a nested `<svg>`'s viewBox into its x/y/width/height box (meet, centered). */
const nestedSvgTransform = (nested: Element): string | null => {
  const x = length(nested, 'x', 0)
  const y = length(nested, 'y', 0)
  const viewBox = readViewBoxAttribute(nested)
  if (!viewBox) return x === 0 && y === 0 ? null : `translate(${x} ${y})`
  const [minX, minY, vbWidth, vbHeight] = viewBox
  const width = length(nested, 'width', vbWidth)
  const height = length(nested, 'height', vbHeight)
  const s = Math.min(width / vbWidth, height / vbHeight)
  const tx = x + (width - s * vbWidth) / 2 - s * minX
  const ty = y + (height - s * vbHeight) / 2 - s * minY
  return matrixToSvg({ a: s, b: 0, c: 0, d: s, e: tx, f: ty })
}

/** Split a document root into layers, bottom-most first (SVG paint order). */
export const splitRoot = (root: SVGSVGElement): SplitItem[] => {
  const children = renderableChildren(root)
  // Names must be read before sanitizing, which drops `inkscape:label`.
  const names = children.map((child, index) => layerName(child, index))
  const nestedNames = children.map((child) =>
    child.localName === 'svg'
      ? renderableChildren(child).map((grandchild, index) => layerName(grandchild, index))
      : [],
  )
  sanitizeElement(root)

  // Lifting a child out of the root drops what it inherited, so the wrapper carries it.
  const rootAttributes = carriedAttributes(root)
  const rootTransform = root.getAttribute('transform')
  const rootOpacity = readOpacity(root)

  const items: SplitItem[] = []
  for (const [index, child] of children.entries()) {
    const name = names[index] ?? `Layer ${index + 1}`
    if (child.localName === 'svg') {
      const transform = joinTransforms(
        rootTransform,
        child.getAttribute('transform'),
        nestedSvgTransform(child),
      )
      const attributes = { ...rootAttributes, ...carriedAttributes(child) }
      const opacity = rootOpacity * readOpacity(child)
      const grandchildren = renderableChildren(child)
      const layers = grandchildren.map((grandchild, i) =>
        toSplitLayer(
          root,
          wrapInGroup([grandchild], transform, attributes),
          nestedNames[index]?.[i] ?? `Layer ${i + 1}`,
          opacity,
        ),
      )
      items.push({ kind: 'group', name, layers })
      continue
    }
    items.push({
      kind: 'layer',
      layer: toSplitLayer(
        root,
        wrapInGroup([child], rootTransform, rootAttributes),
        name,
        rootOpacity,
      ),
    })
  }
  return items
}

/** Every renderable root child in one layer — the multi-file import shape. */
export const wholeDocumentLayer = (root: SVGSVGElement, name: string): SplitLayer => {
  const children = renderableChildren(root)
  sanitizeElement(root)
  if (children.length === 0) return { name, svg: '<g/>', defs: '', opacity: 1 }
  const g = wrapInGroup(children, root.getAttribute('transform'), carriedAttributes(root))
  return toSplitLayer(root, g, name, readOpacity(root))
}

// --- layer actions -----------------------------------------------------------

const parseFragment = (svg: string, defs = ''): SVGSVGElement | null => {
  const result = parseSvg(`<svg xmlns="${SVG_NS}"><defs>${defs}</defs>${svg}</svg>`)
  return result.ok ? result.root : null
}

/**
 * One layer per child of the layer's group. A layer whose `<g>` holds a single
 * `<g>` is unwrapped one level first, so splitting an exporter's artboard group
 * yields its artwork rather than the artboard itself. Returned top-most first.
 */
export const splitLayer = (layer: Layer): Layer[] => {
  const root = parseFragment(layer.svg, layer.defs)
  const outerGroup = root?.children[1]
  if (!root || !outerGroup) return [layer]

  let container = outerGroup
  let transform = outerGroup.getAttribute('transform')
  let attributes = carriedAttributes(outerGroup)
  // group opacity composites the subtree as one unit; per-layer opacity is the closest we get
  let opacity = layer.opacity * readOpacity(outerGroup)
  const only = renderableChildren(outerGroup)
  const single = only.length === 1 ? only[0] : undefined
  if (single && single.localName === 'g' && renderableChildren(single).length > 0) {
    container = single
    transform = joinTransforms(transform, single.getAttribute('transform'))
    attributes = { ...attributes, ...carriedAttributes(single) }
    opacity *= readOpacity(single)
  }

  const children = renderableChildren(container)
  if (children.length < 2) return [layer]

  const { transform: layerTransform, blendMode, glass, hidden, overrides, sourceViewBox } = layer

  // A scaled or rotated parent pivots about *its own* fitted bbox centre, so handing
  // each part the same `Transform` would swing every part around a different pivot and
  // scatter them. Bake the parent's matrix into the markup instead — as `mergeLayers`
  // does — and hand the parts an identity transform on the 1024 canvas.
  const bake = !isIdentityTransform(layerTransform)
  const parentMatrix = bake ? matrixToSvg(layerMatrix(layer)) : ''
  const partViewBox: ViewBox = bake ? [0, 0, CANVAS_SIZE, CANVAS_SIZE] : sourceViewBox

  const parts = children.map((child, index) => {
    const name = layerName(child, index)
    const g = child.ownerDocument.createElementNS(SVG_NS, 'g')
    applyWrapperAttributes(g, transform, attributes)
    g.appendChild(child)
    const sourceSvg = serializeElement(g)
    const scratch = parseFragment(sourceSvg, layer.defs)
    const scratchGroup = scratch?.children[1]
    const defs = scratch && scratchGroup ? collectDefs(scratch, scratchGroup) : ''
    const svg = bake ? `<g transform="${parentMatrix}">${sourceSvg}</g>` : sourceSvg
    return createLayer({
      name,
      svg,
      defs,
      sourceViewBox: partViewBox,
      bbox: measureBBox(svg, defs, partViewBox),
      transform: bake ? identityTransform() : layerTransform,
      opacity,
      blendMode,
      glass,
      hidden,
      overrides,
    })
  })
  return parts.reverse()
}

const unionBBox = (boxes: BBox[]): BBox => {
  const first = boxes[0]
  if (!first) return { x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE }
  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.width
  let maxY = first.y + first.height
  for (const box of boxes.slice(1)) {
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width)
    maxY = Math.max(maxY, box.y + box.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Bake several layers into one canvas-space layer. Input is top-most first;
 * every layer's own matrix and opacity are frozen into the merged markup.
 */
export const mergeLayers = (layers: Layer[]): Layer => {
  const top = layers[0]
  if (!top) throw new Error('mergeLayers needs at least one layer')
  const paintOrder = [...layers].reverse()

  // Layers from different files routinely declare the same ids (`clip0`, `a`, …), and
  // concatenating their markup would let the first declaration win for everyone. Give
  // each layer its own namespace before the fragments meet.
  const namespaced = paintOrder.map((l, n) => ({
    layer: l,
    ...prefixIds(l.svg, l.defs, `m${n}-`),
  }))

  const svg = `<g>${namespaced
    .map(({ layer: l, svg: markup }) => {
      const opacity = l.opacity !== 1 ? ` opacity="${l.opacity}"` : ''
      return `<g transform="${matrixToSvg(layerMatrix(l))}"${opacity}>${markup}</g>`
    })
    .join('')}</g>`

  const defs = Array.from(new Set(namespaced.map((n) => n.defs).filter((d) => d !== ''))).join('')

  return createLayer({
    name: top.name,
    svg,
    defs,
    sourceViewBox: [0, 0, CANVAS_SIZE, CANVAS_SIZE],
    bbox: unionBBox(layers.map((l) => layerCanvasBBox(l))),
    blendMode: top.blendMode,
    glass: top.glass,
    hidden: top.hidden,
    overrides: top.overrides,
  })
}
