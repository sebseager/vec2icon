import { describe, expect, it } from 'vitest'
import { createLayer } from '../model/defaults'
import { layerCanvasBBox, layerMatrix, matrixToSvg } from '../model/geometry'
import type { Layer } from '../model/types'
import { fixture } from './__fixtures__'
import { parseSvg } from './parse'
import {
  isRenderable,
  layerName,
  mergeLayers,
  type SplitGroup,
  splitLayer,
  splitRoot,
  wholeDocumentLayer,
} from './split'
import { resolveStyles } from './styles'

const rootOf = (name: string): SVGSVGElement => {
  const result = parseSvg(fixture(name))
  if (!result.ok) throw new Error(result.reason)
  resolveStyles(result.root)
  return result.root
}

const rootOfMarkup = (markup: string): SVGSVGElement => {
  const result = parseSvg(markup)
  if (!result.ok) throw new Error(result.reason)
  resolveStyles(result.root)
  return result.root
}

const elementOf = (markup: string): Element => {
  const result = parseSvg(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`)
  if (!result.ok) throw new Error(result.reason)
  return result.root.firstElementChild as Element
}

const layerOf = (svg: string, extra: Partial<Layer> = {}): Layer =>
  createLayer({
    name: 'Source',
    svg,
    defs: '',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 0, y: 0, width: 100, height: 100 },
    ...extra,
  })

describe('isRenderable', () => {
  it('accepts drawable elements and containers', () => {
    for (const tag of [
      'g',
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
      'svg',
      'foo',
    ]) {
      expect(isRenderable(elementOf(`<${tag}/>`))).toBe(true)
    }
  })

  it('rejects metadata-ish elements', () => {
    for (const tag of ['defs', 'metadata', 'title', 'desc', 'style', 'script']) {
      expect(isRenderable(elementOf(`<${tag}/>`))).toBe(false)
    }
  })

  it('rejects elements from a foreign namespace', () => {
    const root = rootOf('inkscape.svg')
    const namedview = Array.from(root.children).find((el) => el.localName === 'namedview')
    expect(namedview).toBeDefined()
    expect(isRenderable(namedview as Element)).toBe(false)
  })
})

describe('layerName', () => {
  it('prefers id, then <title>, then inkscape:label, then a positional name', () => {
    expect(layerName(elementOf('<g id="Badge"><title>T</title></g>'), 0)).toBe('Badge')
    expect(layerName(elementOf('<g><title>Leaf</title></g>'), 0)).toBe('Leaf')
    expect(
      layerName(
        elementOf(
          '<g xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" inkscape:label="Background"/>',
        ),
        0,
      ),
    ).toBe('Background')
    expect(layerName(elementOf('<g/>'), 2)).toBe('Layer 3')
  })

  it('ignores a <title> that is not a direct child', () => {
    expect(layerName(elementOf('<g><g><title>Deep</title></g></g>'), 0)).toBe('Layer 1')
  })
})

describe('splitRoot', () => {
  it('makes one layer per renderable root child, in paint order', () => {
    const items = splitRoot(rootOf('illustrator.svg'))
    expect(items.map((i) => (i.kind === 'layer' ? i.layer.name : i.name))).toEqual([
      'Layer 1',
      'hero',
      'Layer 3',
    ])
    expect(items.every((i) => i.kind === 'layer')).toBe(true)
  })

  it('wraps each child in a <g> and keeps its own transform', () => {
    const items = splitRoot(rootOf('affinity.svg'))
    expect(items).toHaveLength(1)
    const item = items[0]
    if (item?.kind !== 'layer') throw new Error('expected a layer')
    expect(item.layer.name).toBe('Artboard')
    expect(item.layer.svg).toContain('<g id="Artboard">')
    expect(item.layer.svg).toContain('transform="matrix(1.5,0,0,1.5,-100,-100)"')
  })

  it('carries the root svg presentation attributes onto every wrapper', () => {
    const items = splitRoot(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="#f00" fill-rule="evenodd"><path d="M0 0 H10 V10 Z"/><rect width="4" height="4"/></svg>',
      ),
    )
    expect(items).toHaveLength(2)
    for (const item of items) {
      if (item.kind !== 'layer') throw new Error('expected a layer')
      expect(item.layer.svg.startsWith('<g fill="#f00" fill-rule="evenodd">')).toBe(true)
    }
  })

  it('carries presentation attributes the root only got from css', () => {
    const items = splitRoot(rootOfMarkup(fixture('affinity.svg')))
    const item = items[0]
    if (item?.kind !== 'layer') throw new Error('expected a layer')
    expect(item.layer.svg).toContain('fill-rule="evenodd"')
    expect(item.layer.svg).toContain('clip-rule="evenodd"')
    expect(item.layer.svg).toContain('stroke-linejoin="round"')
    expect(item.layer.svg).toContain('stroke-miterlimit="2"')
  })

  it('carries Figma\'s root fill="none" so unfilled shapes stay unfilled', () => {
    const items = splitRoot(rootOf('figma.svg'))
    const item = items[0]
    if (item?.kind !== 'layer') throw new Error('expected a layer')
    expect(item.layer.svg.startsWith('<g fill="none">')).toBe(true)
  })

  it('does not carry display, visibility or non-presentation attributes', () => {
    const items = splitRoot(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" id="Root" display="inline" visibility="visible" fill="#f00"><rect width="4" height="4"/></svg>',
      ),
    )
    const item = items[0]
    if (item?.kind !== 'layer') throw new Error('expected a layer')
    expect(item.layer.svg.startsWith('<g fill="#f00">')).toBe(true)
    expect(item.layer.svg).not.toContain('display=')
    expect(item.layer.svg).not.toContain('visibility=')
    expect(item.layer.svg).not.toContain('id="Root"')
  })

  it('carries a root transform when there is one', () => {
    const items = splitRoot(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" transform="translate(3,4)"><rect width="4" height="4"/></svg>',
      ),
    )
    const item = items[0]
    if (item?.kind !== 'layer') throw new Error('expected a layer')
    expect(item.layer.svg.startsWith('<g transform="translate(3,4)">')).toBe(true)
  })

  it('lifts a root opacity into the layer rather than onto the wrapper', () => {
    const items = splitRoot(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" opacity="0.5"><rect width="4" height="4"/><circle r="2"/></svg>',
      ),
    )
    expect(items).toHaveLength(2)
    for (const item of items) {
      if (item.kind !== 'layer') throw new Error('expected a layer')
      expect(item.layer.opacity).toBeCloseTo(0.5)
      expect(item.layer.svg).not.toContain('opacity=')
    }
  })

  it('multiplies a nested svg opacity into the root opacity', () => {
    const items = splitRoot(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" opacity="0.5"><svg x="0" y="0" width="100" height="100" viewBox="0 0 10 10" opacity="0.4"><circle cx="5" cy="5" r="4"/></svg></svg>',
      ),
    )
    const group = items[0] as SplitGroup
    expect(group.layers[0]?.opacity).toBeCloseTo(0.2)
    expect(group.layers[0]?.svg).not.toContain('opacity=')
  })

  it('defaults the layer opacity to 1', () => {
    const items = splitRoot(rootOf('figma.svg'))
    const item = items[0]
    if (item?.kind !== 'layer') throw new Error('expected a layer')
    expect(item.layer.opacity).toBe(1)
  })

  it('carries the defs a layer references', () => {
    const items = splitRoot(rootOf('figma.svg'))
    expect(items).toHaveLength(1)
    const item = items[0]
    if (item?.kind !== 'layer') throw new Error('expected a layer')
    expect(item.layer.defs).toContain('id="clip0_1_2"')
    expect(item.layer.defs).toContain('id="paint0_linear_1_2"')
  })

  it('names inkscape layers from <title> then inkscape:label', () => {
    const items = splitRoot(rootOf('inkscape.svg'))
    expect(items.map((i) => (i.kind === 'layer' ? i.layer.name : i.name))).toEqual([
      'Background',
      'Leaf',
    ])
  })

  it('turns a nested <svg> into a group whose layers carry the placement transform', () => {
    const items = splitRoot(rootOf('nested-svg.svg'))
    expect(items.map((i) => i.kind)).toEqual(['layer', 'group'])
    const group = items[1] as SplitGroup
    expect(group.name).toBe('Badge')
    expect(group.layers.map((l) => l.name)).toEqual(['Ring', 'Tick'])
    // viewBox 0 0 10 10 fitted into x=50 y=50 100x100 -> scale 10, translate 50,50
    expect(group.layers[0]?.svg).toContain('transform="matrix(10 0 0 10 50 50)"')
  })

  it('gives a nested svg group both the root and the nested presentation attributes', () => {
    const items = splitRoot(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="#f00" stroke="#000"><svg x="0" y="0" width="100" height="100" viewBox="0 0 10 10" fill="#00f"><circle cx="5" cy="5" r="4"/></svg></svg>',
      ),
    )
    const group = items[0] as SplitGroup
    expect(group.kind).toBe('group')
    const svg = group.layers[0]?.svg ?? ''
    expect(svg).toContain('transform="matrix(10 0 0 10 0 0)"')
    expect(svg).toContain('stroke="#000"')
    expect(svg).toContain('fill="#00f"') // the nested svg wins over the root
    expect(svg).not.toContain('fill="#f00"')
  })

  it('composes a root transform with a nested svg placement', () => {
    const items = splitRoot(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" transform="translate(7,8)"><svg x="0" y="0" width="100" height="100" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg></svg>',
      ),
    )
    const group = items[0] as SplitGroup
    expect(group.layers[0]?.svg).toContain('transform="translate(7,8) matrix(10 0 0 10 0 0)"')
  })
})

describe('wholeDocumentLayer', () => {
  it('puts every renderable root child into one layer', () => {
    const layer = wholeDocumentLayer(rootOf('illustrator.svg'), 'illustrator')
    expect(layer.name).toBe('illustrator')
    expect(layer.svg.startsWith('<g>')).toBe(true)
    expect(layer.svg).toContain('<rect')
    expect(layer.svg).toContain('<path')
    expect(layer.svg).toContain('<circle')
    expect(layer.defs).toContain('id="linear-gradient"')
  })

  it('lifts a root opacity into the layer', () => {
    const layer = wholeDocumentLayer(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" opacity="0.25"><rect width="4" height="4"/></svg>',
      ),
      'doc',
    )
    expect(layer.opacity).toBeCloseTo(0.25)
    expect(layer.svg).not.toContain('opacity=')
  })

  it('carries the root presentation attributes onto the single wrapper', () => {
    const layer = wholeDocumentLayer(
      rootOfMarkup(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="#0f0"><rect width="4" height="4"/><circle r="2"/></svg>',
      ),
      'doc',
    )
    expect(layer.svg.startsWith('<g fill="#0f0">')).toBe(true)
  })
})

describe('splitLayer', () => {
  it('unwraps a single wrapper <g> and splits its children, top-most first', () => {
    const items = splitRoot(rootOf('affinity.svg'))
    const item = items[0]
    if (item?.kind !== 'layer') throw new Error('expected a layer')
    const parent = layerOf(item.layer.svg, { sourceViewBox: [0, 0, 400, 400] })
    const children = splitLayer(parent)
    expect(children).toHaveLength(2)
    expect(children[0]?.svg).toContain('<rect')
    expect(children[1]?.svg).toContain('<path')
  })

  it('keeps the unwrapped group transform on every child', () => {
    const children = splitLayer(
      layerOf('<g><g transform="scale(2)"><rect width="4" height="4"/><circle r="3"/></g></g>'),
    )
    expect(children).toHaveLength(2)
    for (const child of children)
      expect(child.svg.startsWith('<g transform="scale(2)">')).toBe(true)
  })

  it('keeps the wrapper presentation attributes on every child', () => {
    const children = splitLayer(
      layerOf(
        '<g fill="#f00" fill-rule="evenodd"><g transform="scale(2)"><rect width="4" height="4"/><circle r="3"/></g></g>',
      ),
    )
    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.svg.startsWith('<g transform="scale(2)" fill="#f00" fill-rule="evenodd">')).toBe(
        true,
      )
    }
  })

  it('folds a group opacity into each child layer instead of replicating it', () => {
    const children = splitLayer(
      layerOf('<g opacity="0.35"><rect width="4" height="4"/><circle r="3"/></g>'),
    )
    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.opacity).toBeCloseTo(0.35)
      expect(child.svg).not.toContain('opacity=')
    }
  })

  it('multiplies the group opacity by the parent layer opacity', () => {
    const children = splitLayer(
      layerOf('<g opacity="0.35"><rect width="4" height="4"/><circle r="3"/></g>', {
        opacity: 0.5,
      }),
    )
    for (const child of children) expect(child.opacity).toBeCloseTo(0.175)
  })

  it('multiplies the wrapper and the unwrapped group opacities together', () => {
    const children = splitLayer(
      layerOf(
        '<g opacity="0.5"><g opacity="0.4"><rect width="4" height="4"/><circle r="3"/></g></g>',
      ),
    )
    expect(children).toHaveLength(2)
    for (const child of children) expect(child.opacity).toBeCloseTo(0.2)
  })

  it('leaves a child element opacity where it belongs', () => {
    const children = splitLayer(
      layerOf('<g><rect width="4" height="4" opacity="0.3"/><circle r="3"/></g>'),
    )
    expect(children[1]?.opacity).toBe(1)
    expect(children[1]?.svg).toContain('opacity="0.3"')
  })

  it('composes the wrapper transform with the unwrapped group transform', () => {
    const children = splitLayer(
      layerOf(
        '<g transform="translate(1,2)"><g transform="scale(2)"><rect width="4" height="4"/><circle r="3"/></g></g>',
      ),
    )
    for (const child of children) {
      expect(child.svg.startsWith('<g transform="translate(1,2) scale(2)">')).toBe(true)
    }
  })

  it('keeps the wrapper attributes when there is no group to unwrap', () => {
    const children = splitLayer(
      layerOf('<g fill="#f00"><rect width="4" height="4"/><circle r="3"/></g>'),
    )
    expect(children).toHaveLength(2)
    for (const child of children) expect(child.svg.startsWith('<g fill="#f00">')).toBe(true)
  })

  it('copies the parent presentation and re-measures each child', () => {
    const parent = layerOf(
      '<g><rect x="0" y="0" width="10" height="10"/><rect x="50" y="50" width="10" height="10"/></g>',
      { opacity: 0.5, blendMode: 'multiply', glass: false, hidden: true },
    )
    const children = splitLayer(parent)
    expect(children).toHaveLength(2)
    for (const child of children) {
      expect(child.opacity).toBe(0.5)
      expect(child.blendMode).toBe('multiply')
      expect(child.glass).toBe(false)
      expect(child.hidden).toBe(true)
      expect(child.sourceViewBox).toEqual([0, 0, 100, 100])
      expect(child.id).not.toBe(parent.id)
    }
    expect(children[0]?.bbox).toEqual({ x: 50, y: 50, width: 10, height: 10 })
    expect(children[1]?.bbox).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('gives each child only the defs it references', () => {
    const parent = layerOf(
      '<g><rect width="10" height="10" fill="url(#a)"/><rect width="10" height="10" fill="url(#b)"/></g>',
      {
        defs: '<linearGradient id="a"><stop offset="0" stop-color="#000"/></linearGradient><linearGradient id="b"><stop offset="0" stop-color="#fff"/></linearGradient>',
      },
    )
    const children = splitLayer(parent)
    expect(children[1]?.defs).toBe(
      '<linearGradient id="a"><stop offset="0" stop-color="#000"/></linearGradient>',
    )
    expect(children[0]?.defs).toBe(
      '<linearGradient id="b"><stop offset="0" stop-color="#fff"/></linearGradient>',
    )
  })

  it('bakes a non-identity parent transform into every part', () => {
    const parent = layerOf(
      '<g><rect x="0" y="0" width="10" height="10"/><rect x="50" y="50" width="10" height="10"/></g>',
      {
        bbox: { x: 0, y: 0, width: 60, height: 60 },
        transform: { x: 120, y: -40, scaleX: 2, scaleY: 1.5, rotation: 0 },
      },
    )
    const parts = splitLayer(parent)
    expect(parts).toHaveLength(2)
    for (const part of parts) {
      expect(part.sourceViewBox).toEqual([0, 0, 1024, 1024])
      expect(part.transform).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
      expect(part.svg.startsWith(`<g transform="${matrixToSvg(layerMatrix(parent))}">`)).toBe(true)
    }
    const union = parts
      .map((part) => layerCanvasBBox(part))
      .reduce((a, b) => ({
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.max(a.x + a.width, b.x + b.width) - Math.min(a.x, b.x),
        height: Math.max(a.y + a.height, b.y + b.height) - Math.min(a.y, b.y),
      }))
    const expected = layerCanvasBBox(parent)
    expect(union.x).toBeCloseTo(expected.x, 6)
    expect(union.y).toBeCloseTo(expected.y, 6)
    expect(union.width).toBeCloseTo(expected.width, 6)
    expect(union.height).toBeCloseTo(expected.height, 6)
  })

  it('keeps the parts of a rotated parent inside its canvas bounds', () => {
    const parent = layerOf(
      '<g><rect x="0" y="0" width="10" height="10"/><rect x="50" y="50" width="10" height="10"/></g>',
      {
        bbox: { x: 0, y: 0, width: 60, height: 60 },
        transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 30 },
      },
    )
    const bounds = layerCanvasBBox(parent)
    for (const part of splitLayer(parent)) {
      const box = layerCanvasBBox(part)
      expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1e-6)
      expect(box.y).toBeGreaterThanOrEqual(bounds.y - 1e-6)
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width + 1e-6)
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height + 1e-6)
    }
  })

  it('returns the layer untouched when there is nothing to split', () => {
    const single = layerOf('<g><rect width="10" height="10"/></g>')
    expect(splitLayer(single)).toEqual([single])
    const empty = layerOf('<g></g>')
    expect(splitLayer(empty)).toEqual([empty])
  })
})

describe('mergeLayers', () => {
  const bottom = layerOf('<g><rect id="b" width="50" height="50"/></g>', {
    name: 'Bottom',
    bbox: { x: 0, y: 0, width: 50, height: 50 },
  })
  const top = layerOf('<g><rect id="t" x="50" y="50" width="50" height="50"/></g>', {
    name: 'Top',
    bbox: { x: 50, y: 50, width: 50, height: 50 },
    blendMode: 'screen',
    glass: false,
  })

  it('bakes each layer matrix and paints bottom-most first', () => {
    const merged = mergeLayers([top, bottom])
    expect(merged.svg.indexOf('id="m0-b"')).toBeLessThan(merged.svg.indexOf('id="m1-t"'))
    expect(merged.svg.startsWith('<g><g transform="matrix(10.24 0 0 10.24 0 0)">')).toBe(true)
    expect(merged.svg.endsWith('</g></g>')).toBe(true)
  })

  it('unions the canvas bounding boxes onto the 1024 canvas', () => {
    const merged = mergeLayers([top, bottom])
    expect(merged.sourceViewBox).toEqual([0, 0, 1024, 1024])
    expect(merged.bbox).toEqual({ x: 0, y: 0, width: 1024, height: 1024 })
    expect(merged.transform).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
    expect(merged.opacity).toBe(1)
  })

  it('takes name and presentation from the top-most layer', () => {
    const merged = mergeLayers([top, bottom])
    expect(merged.name).toBe('Top')
    expect(merged.blendMode).toBe('screen')
    expect(merged.glass).toBe(false)
    expect(merged.issues).toEqual([])
  })

  it('writes an opacity wrapper only for layers that need one', () => {
    const faded = { ...bottom, opacity: 0.25 }
    const merged = mergeLayers([top, faded])
    expect(merged.svg).toContain('opacity="0.25"')
    expect(merged.svg.match(/opacity=/g)).toHaveLength(1)
  })

  it('namespaces the ids of each layer so identical ones do not collide', () => {
    const defs = '<linearGradient id="p"><stop offset="0" stop-color="#000"/></linearGradient>'
    const merged = mergeLayers([
      { ...top, svg: '<g fill="url(#p)"><rect id="p" width="10" height="10"/></g>', defs },
      { ...bottom, svg: '<g fill="url(#p)"><rect id="p" width="10" height="10"/></g>', defs },
    ])
    const declared = [...merged.defs.matchAll(/id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(declared).size).toBe(2)
    expect(merged.defs).toContain('id="m0-p"')
    expect(merged.defs).toContain('id="m1-p"')
    expect(merged.svg).toContain('url(#m0-p)')
    expect(merged.svg).toContain('url(#m1-p)')
    expect(merged.svg).not.toContain('url(#p)')
  })
})
