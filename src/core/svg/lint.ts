import { type Matrix, multiply } from '../model/geometry'
import type { IconDoc, Issue, IssueCode, IssueFix, Layer } from '../model/types'
import { backgroundFill, detectBackground, removeBackground } from './background'
import { elementBBox, measureBBox, parseTransform } from './bbox'
import { parseSvg } from './parse'
import { serializeElement } from './serialize'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** A rect this close to filling the canvas is a backdrop, not artwork. */
const INVISIBLE_RECT_COVERAGE = 0.99
/** More than this many groups and Icon Composer starts to disagree with us. */
const MAX_GROUPS = 4

const MASK_FIX: IssueFix = {
  id: 'remove-masks',
  label: 'Remove masks and clips',
  warning: 'May reveal hidden geometry',
}

type Fragment = { root: SVGSVGElement; defs: Element; group: Element }

const parseLayer = (layer: Layer): Fragment | null => {
  const result = parseSvg(`<svg xmlns="${SVG_NS}"><defs>${layer.defs}</defs>${layer.svg}</svg>`)
  if (!result.ok) return null
  const defs = result.root.children[0]
  const group = result.root.children[1]
  return defs && group ? { root: result.root, defs, group } : null
}

const elementsOf = (el: Element): Element[] => Array.from(el.querySelectorAll('*'))

const hasTag = (el: Element, tag: string): boolean =>
  elementsOf(el).some((child) => child.localName === tag)

const hasAttribute = (el: Element, name: string): boolean =>
  el.hasAttribute(name) || elementsOf(el).some((child) => child.hasAttribute(name))

const isZero = (value: string | null): boolean => value !== null && Number.parseFloat(value) === 0

/** Rects that fill the layer but paint nothing. */
const invisibleRects = (fragment: Fragment, layer: Layer): Element[] => {
  const [, , viewWidth, viewHeight] = layer.sourceViewBox
  const area = viewWidth * viewHeight
  if (area <= 0) return []
  const found: Element[] = []
  const walk = (el: Element, base: Matrix): void => {
    for (const child of Array.from(el.children)) {
      const composed = multiply(base, parseTransform(child.getAttribute('transform')))
      if (child.localName === 'rect') {
        const invisible =
          child.getAttribute('fill') === 'none' ||
          isZero(child.getAttribute('opacity')) ||
          isZero(child.getAttribute('fill-opacity'))
        const box = invisible ? elementBBox(child, base) : null
        if (box && box.width * box.height >= INVISIBLE_RECT_COVERAGE * area) found.push(child)
      }
      walk(child, composed)
    }
  }
  walk(fragment.group, parseTransform(fragment.group.getAttribute('transform')))
  return found
}

const DRAWABLE = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'image',
  'use',
])

/** Does anything in this subtree actually paint? `display:none` subtrees do not. */
const hasVisibleContent = (el: Element): boolean => {
  for (const child of Array.from(el.children)) {
    if (child.getAttribute('display') === 'none') continue
    if (DRAWABLE.has(child.localName)) return true
    if (hasVisibleContent(child)) return true
  }
  return false
}

/** Problems Icon Composer will not render the way the artwork intends. */
export const lintLayer = (layer: Layer, ctx: { bottomMost: boolean }): Issue[] => {
  const fragment = parseLayer(layer)
  if (!fragment) return []
  const { defs, group } = fragment
  const issues: Issue[] = []

  if (hasAttribute(group, 'filter') || hasTag(group, 'filter') || hasTag(defs, 'filter')) {
    issues.push({
      code: 'filter',
      message: 'Uses an SVG filter',
      help: 'Icon Composer does not render SVG filters. Remove them, or bake the effect into the artwork in your design tool.',
      fixes: [{ id: 'remove-filters', label: 'Remove filters' }],
    })
  }

  const masked =
    hasAttribute(group, 'mask') ||
    hasAttribute(group, 'clip-path') ||
    hasTag(defs, 'mask') ||
    hasTag(defs, 'clipPath')
  if (masked) {
    issues.push({
      code: 'mask',
      message: 'Uses a mask or clipping path',
      help: 'Masks and clips are unreliable in Icon Composer. Flatten them in your design tool, or remove them and trim the artwork by hand.',
      fixes: [MASK_FIX],
    })
  }

  if (hasTag(group, 'image')) {
    issues.push({
      code: 'raster',
      message: 'Contains a raster image',
      help: 'Embedded bitmaps do not scale with the icon. Replace them with vector artwork, or remove them.',
      fixes: [{ id: 'remove-images', label: 'Remove images' }],
    })
  }

  if (hasTag(group, 'text')) {
    issues.push({
      code: 'text',
      message: 'Contains live text',
      help: 'Live text needs the font to be installed. Convert the text to outlines in your design tool and import again.',
      fixes: [],
    })
  }

  if (invisibleRects(fragment, layer).length > 0) {
    issues.push({
      code: 'invisible-rect',
      message: 'Has an invisible full-canvas rectangle',
      help: 'Exporters add a transparent rectangle to pad the canvas. It contributes nothing and skews the layer bounds.',
      fixes: [{ id: 'remove', label: 'Remove' }],
    })
  }

  if (ctx.bottomMost && detectBackground(layer)) {
    const fixes: IssueFix[] = [{ id: 'remove', label: 'Remove' }]
    if (backgroundFill(layer)) fixes.push({ id: 'to-fill', label: 'Use as icon fill' })
    issues.push({
      code: 'background',
      message: 'Bottom layer looks like a background',
      help: 'Icons get their background from the document fill, which adapts to every appearance. Remove this shape or turn it into that fill.',
      fixes,
    })
  }

  if (!hasVisibleContent(group)) {
    issues.push({
      code: 'empty',
      message: 'Layer draws nothing',
      help: 'This layer has no visible geometry, so it will not appear in the exported icon.',
      fixes: [{ id: 'delete', label: 'Delete layer' }],
    })
  }

  return issues
}

/** Problems that belong to the document rather than to one layer. */
export const lintDoc = (doc: IconDoc): Issue[] => {
  if (doc.groups.length <= MAX_GROUPS) return []
  return [
    {
      code: 'groups',
      message: 'More than 4 groups',
      help: 'Icon Composer icons read best with at most four groups. Merge related groups before exporting.',
      fixes: [],
    },
  ]
}

/** Re-serialize an edited fragment back into a layer, re-measuring and re-linting. */
const rebuild = (layer: Layer, fragment: Fragment): Layer => {
  const defs = Array.from(fragment.defs.children)
    .map((el) => serializeElement(el))
    .join('')
  const svg = serializeElement(fragment.group)
  const next: Layer = {
    ...layer,
    svg,
    defs,
    bbox: measureBBox(svg, defs, layer.sourceViewBox),
    issues: [],
  }
  return { ...next, issues: lintLayer(next, { bottomMost: false }) }
}

const removeAll = (elements: Element[]): void => {
  for (const el of elements) el.parentNode?.removeChild(el)
}

const stripAttribute = (root: Element, name: string): void => {
  for (const el of [root, ...elementsOf(root)]) el.removeAttribute(name)
}

/**
 * Apply one of an issue's fixes. Returns null when the fix removes the layer —
 * the caller reads `backgroundFill` before applying 'background'/'to-fill'.
 */
export const applyLayerFix = (layer: Layer, code: IssueCode, fixId: string): Layer | null => {
  if ((code === 'empty' && fixId === 'delete') || (code === 'background' && fixId === 'to-fill')) {
    return null
  }
  if (code === 'background' && fixId === 'remove') {
    const stripped = removeBackground(layer)
    return { ...stripped, issues: lintLayer(stripped, { bottomMost: false }) }
  }

  const fragment = parseLayer(layer)
  if (!fragment) return layer
  const { defs, group } = fragment

  if (code === 'filter' && fixId === 'remove-filters') {
    stripAttribute(group, 'filter')
    removeAll([...elementsOf(group), ...elementsOf(defs)].filter((el) => el.localName === 'filter'))
  } else if (code === 'mask' && fixId === 'remove-masks') {
    stripAttribute(group, 'mask')
    stripAttribute(group, 'clip-path')
    removeAll(
      [...elementsOf(group), ...elementsOf(defs)].filter(
        (el) => el.localName === 'mask' || el.localName === 'clipPath',
      ),
    )
  } else if (code === 'raster' && fixId === 'remove-images') {
    removeAll(elementsOf(group).filter((el) => el.localName === 'image'))
  } else if (code === 'invisible-rect' && fixId === 'remove') {
    removeAll(invisibleRects(fragment, layer))
  } else {
    return layer
  }

  return rebuild(layer, fragment)
}

/** `layers` is top-most first, so the last one is the bottom-most in paint order. */
export const relintLayers = (layers: Layer[]): Layer[] =>
  layers.map((layer, index) => ({
    ...layer,
    issues: lintLayer(layer, { bottomMost: index === layers.length - 1 }),
  }))
