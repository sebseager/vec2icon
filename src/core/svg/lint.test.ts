import { describe, expect, it } from 'vitest'
import { createGroup, createLayer, emptyDoc } from '../model/defaults'
import type { IconDoc, IssueCode, Layer, ViewBox } from '../model/types'
import { applyLayerFix, lintDoc, lintLayer, relintLayers } from './lint'

const VB: ViewBox = [0, 0, 1024, 1024]

const layerOf = (svg: string, defs = '', sourceViewBox: ViewBox = VB): Layer =>
  createLayer({
    name: 'L',
    svg,
    defs,
    sourceViewBox,
    bbox: { x: 0, y: 0, width: sourceViewBox[2], height: sourceViewBox[3] },
  })

const codes = (layer: Layer, bottomMost = false): IssueCode[] =>
  lintLayer(layer, { bottomMost }).map((i) => i.code)

const issue = (layer: Layer, code: IssueCode, bottomMost = false) =>
  lintLayer(layer, { bottomMost }).find((i) => i.code === code)

const BACKGROUND = '<g><rect width="1024" height="1024" rx="224" fill="#0A84FF"/></g>'
const FILTERED = '<g><rect x="0" y="0" width="10" height="10" filter="url(#f)"/></g>'
const FILTER_DEFS = '<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>'

describe('lintLayer', () => {
  it('reports filters from an attribute or a definition', () => {
    expect(codes(layerOf(FILTERED, FILTER_DEFS))).toContain('filter')
    expect(codes(layerOf('<g><rect width="10" height="10"/></g>', FILTER_DEFS))).toContain('filter')
    expect(issue(layerOf(FILTERED, FILTER_DEFS), 'filter')?.fixes).toEqual([
      { id: 'remove-filters', label: 'Remove filters' },
    ])
  })

  it('reports masks and clip paths, warning about hidden geometry', () => {
    expect(codes(layerOf('<g clip-path="url(#c)"><rect width="10" height="10"/></g>'))).toContain(
      'mask',
    )
    expect(codes(layerOf('<g><rect width="10" height="10" mask="url(#m)"/></g>'))).toContain('mask')
    expect(
      codes(
        layerOf('<g><rect width="10" height="10"/></g>', '<clipPath id="c"><rect/></clipPath>'),
      ),
    ).toContain('mask')
    expect(issue(layerOf('<g><rect mask="url(#m)"/></g>'), 'mask')?.fixes).toEqual([
      {
        id: 'remove-masks',
        label: 'Remove masks and clips',
        warning: 'May reveal hidden geometry',
      },
    ])
  })

  it('reports raster images and live text', () => {
    const raster = layerOf('<g><image x="0" y="0" width="10" height="10" href="data:,"/></g>')
    expect(codes(raster)).toContain('raster')
    expect(issue(raster, 'raster')?.fixes).toEqual([
      { id: 'remove-images', label: 'Remove images' },
    ])

    const text = layerOf('<g><rect width="10" height="10"/><text x="0" y="0">Hi</text></g>')
    expect(codes(text)).toContain('text')
    expect(issue(text, 'text')?.fixes).toEqual([])
    expect(issue(text, 'text')?.help).toBeTruthy()
  })

  it('reports an invisible full-canvas rect', () => {
    const none = layerOf(
      '<g><rect width="1024" height="1024" fill="none"/><rect x="10" y="10" width="10" height="10"/></g>',
    )
    expect(codes(none)).toContain('invisible-rect')
    expect(issue(none, 'invisible-rect')?.fixes).toEqual([{ id: 'remove', label: 'Remove' }])
    expect(
      codes(
        layerOf(
          '<g><rect width="1024" height="1024" opacity="0"/><rect x="1" y="1" width="2" height="2"/></g>',
        ),
      ),
    ).toContain('invisible-rect')
    expect(
      codes(
        layerOf(
          '<g><rect width="1024" height="1024" fill-opacity="0"/><rect x="1" y="1" width="2" height="2"/></g>',
        ),
      ),
    ).toContain('invisible-rect')
  })

  it('does not flag a visible or a small rect as invisible', () => {
    expect(codes(layerOf('<g><rect width="1024" height="1024" fill="#f00"/></g>'))).not.toContain(
      'invisible-rect',
    )
    expect(codes(layerOf('<g><rect width="100" height="100" fill="none"/></g>'))).not.toContain(
      'invisible-rect',
    )
  })

  it('reports a background only for the bottom-most layer', () => {
    expect(codes(layerOf(BACKGROUND), false)).not.toContain('background')
    const found = issue(layerOf(BACKGROUND), 'background', true)
    expect(found?.fixes).toEqual([
      { id: 'remove', label: 'Remove' },
      { id: 'to-fill', label: 'Use as icon fill' },
    ])
  })

  it('omits the to-fill option when the background fill cannot be read', () => {
    const found = issue(
      layerOf('<g><rect width="1024" height="1024" fill="none"/></g>'),
      'background',
      true,
    )
    expect(found?.fixes).toEqual([{ id: 'remove', label: 'Remove' }])
  })

  it('reports an empty layer', () => {
    expect(codes(layerOf('<g></g>'))).toEqual(['empty'])
    expect(codes(layerOf('<g><title>Just a title</title></g>'))).toEqual(['empty'])
    expect(codes(layerOf('<g><rect width="10" height="10" display="none"/></g>'))).toEqual([
      'empty',
    ])
    expect(codes(layerOf('<g><g><rect width="10" height="10"/></g></g>'))).not.toContain('empty')
    expect(issue(layerOf('<g></g>'), 'empty')?.fixes).toEqual([
      { id: 'delete', label: 'Delete layer' },
    ])
  })

  it('gives every issue a short message and help text', () => {
    const layers = [
      layerOf(FILTERED, FILTER_DEFS),
      layerOf('<g clip-path="url(#c)"><rect width="10" height="10"/></g>'),
      layerOf('<g><image width="10" height="10" href="data:,"/></g>'),
      layerOf('<g><text>Hi</text></g>'),
      layerOf(
        '<g><rect width="1024" height="1024" fill="none"/><rect x="1" y="1" width="2" height="2"/></g>',
      ),
      layerOf(BACKGROUND),
      layerOf('<g></g>'),
    ]
    const all = layers.flatMap((layer) => lintLayer(layer, { bottomMost: true }))
    expect(all.length).toBeGreaterThan(6)
    for (const found of all) {
      expect(found.message.length).toBeLessThanOrEqual(60)
      expect(found.message.length).toBeGreaterThan(0)
      expect(found.help).toBeTruthy()
    }
  })

  it('reports nothing for clean artwork', () => {
    expect(codes(layerOf('<g><path d="M0 0 L10 0 L5 8 Z" fill="#f00"/></g>'), true)).toEqual([])
  })
})

describe('lintDoc', () => {
  const docWith = (count: number): IconDoc => ({
    ...emptyDoc(),
    groups: Array.from({ length: count }, (_, i) => createGroup(`G${i}`)),
  })

  it('warns above four groups', () => {
    expect(lintDoc(docWith(4))).toEqual([])
    const issues = lintDoc(docWith(5))
    expect(issues).toHaveLength(1)
    expect(issues[0]?.code).toBe('groups')
    expect(issues[0]?.message).toBe('More than 4 groups')
    expect(issues[0]?.fixes).toEqual([])
    expect(issues[0]?.help).toBeTruthy()
  })
})

describe('applyLayerFix', () => {
  it('removes filters from markup and defs', () => {
    const fixed = applyLayerFix(layerOf(FILTERED, FILTER_DEFS), 'filter', 'remove-filters')
    expect(fixed?.svg).not.toContain('filter=')
    expect(fixed?.defs).toBe('')
    expect(fixed?.issues.map((i) => i.code)).not.toContain('filter')
  })

  it('removes masks and clip paths', () => {
    const layer = layerOf(
      '<g clip-path="url(#c)"><rect width="10" height="10" mask="url(#m)"/></g>',
      '<clipPath id="c"><rect/></clipPath><mask id="m"><rect/></mask>',
    )
    const fixed = applyLayerFix(layer, 'mask', 'remove-masks')
    expect(fixed?.svg).toBe('<g><rect width="10" height="10"/></g>')
    expect(fixed?.defs).toBe('')
    expect(fixed?.issues).toEqual([])
  })

  it('removes images and re-measures what is left', () => {
    const layer = layerOf(
      '<g><image x="0" y="0" width="1000" height="1000" href="data:,"/><rect x="10" y="10" width="20" height="20"/></g>',
    )
    const fixed = applyLayerFix(layer, 'raster', 'remove-images')
    expect(fixed?.svg).toBe('<g><rect x="10" y="10" width="20" height="20"/></g>')
    expect(fixed?.bbox).toEqual({ x: 10, y: 10, width: 20, height: 20 })
  })

  it('removes an invisible rect', () => {
    const layer = layerOf(
      '<g><rect width="1024" height="1024" fill="none"/><rect x="10" y="10" width="20" height="20"/></g>',
    )
    const fixed = applyLayerFix(layer, 'invisible-rect', 'remove')
    expect(fixed?.svg).toBe('<g><rect x="10" y="10" width="20" height="20"/></g>')
    expect(fixed?.issues).toEqual([])
  })

  it('removes a background shape', () => {
    const layer = layerOf(
      '<g><rect width="1024" height="1024" rx="224" fill="#0A84FF"/><rect x="400" y="400" width="100" height="100" fill="#fff"/></g>',
    )
    const fixed = applyLayerFix(layer, 'background', 'remove')
    expect(fixed?.svg).toBe('<g><rect x="400" y="400" width="100" height="100" fill="#fff"/></g>')
    expect(fixed?.bbox).toEqual({ x: 400, y: 400, width: 100, height: 100 })
  })

  it('re-collects defs after removing a background', () => {
    const layer = layerOf(
      '<g><rect width="1024" height="1024" fill="url(#bg)"/><circle cx="512" cy="512" r="100" fill="#fff"/></g>',
      '<linearGradient id="bg" x1="0" y1="1024" x2="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>',
    )
    const fixed = applyLayerFix(layer, 'background', 'remove')
    expect(fixed?.defs).toBe('')
    expect(fixed?.svg).toBe('<g><circle cx="512" cy="512" r="100" fill="#fff"/></g>')
  })

  it('deletes the layer for to-fill and for an empty layer', () => {
    expect(applyLayerFix(layerOf(BACKGROUND), 'background', 'to-fill')).toBeNull()
    expect(applyLayerFix(layerOf('<g></g>'), 'empty', 'delete')).toBeNull()
  })

  it('keeps the id and returns the layer unchanged for an unknown fix', () => {
    const layer = layerOf(FILTERED, FILTER_DEFS)
    expect(applyLayerFix(layer, 'filter', 'nope')).toBe(layer)
    expect(applyLayerFix(layer, 'groups', 'remove-filters')).toBe(layer)
    expect(applyLayerFix(layer, 'raster', 'remove-images')?.id).toBe(layer.id)
  })
})

describe('relintLayers', () => {
  it('lints with bottomMost set for the last layer only', () => {
    const layers = relintLayers([layerOf(BACKGROUND), layerOf(BACKGROUND)])
    expect(layers[0]?.issues.map((i) => i.code)).toEqual([])
    expect(layers[1]?.issues.map((i) => i.code)).toEqual(['background'])
  })

  it('keeps layer identity and returns an empty list unchanged', () => {
    const layer = layerOf(BACKGROUND)
    expect(relintLayers([layer])[0]?.id).toBe(layer.id)
    expect(relintLayers([])).toEqual([])
  })
})
