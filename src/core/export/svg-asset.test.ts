import { describe, expect, it } from 'vitest'
import { createLayer } from '../model/defaults'
import { layerMatrix, matrixToSvg } from '../model/geometry'
import type { Layer } from '../model/types'
import { layerAssetSvg } from './svg-asset'

const layer = (init: Partial<Layer> = {}): Layer =>
  createLayer({
    name: 'Shape',
    svg: '<g><path d="M0 0h10v10H0z"/></g>',
    defs: '',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 0, y: 0, width: 100, height: 100 },
    ...init,
  })

describe('layerAssetSvg', () => {
  it('emits a 1024 canvas with the baked layer matrix', () => {
    const l = layer({ transform: { x: 10, y: -20, scaleX: 2, scaleY: 2, rotation: 15 } })
    const out = layerAssetSvg(l)
    expect(
      out.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">',
      ),
    ).toBe(true)
    expect(out.endsWith('</svg>')).toBe(true)
    expect(out).toContain(`<g transform="${matrixToSvg(layerMatrix(l))}">${l.svg}</g>`)
  })

  it('omits the defs wrapper when the layer has no defs', () => {
    expect(layerAssetSvg(layer())).not.toContain('<defs>')
  })

  it('wraps defs content in a single <defs> element', () => {
    const out = layerAssetSvg(layer({ defs: '<linearGradient id="g"/>' }))
    expect(out).toContain('<defs><linearGradient id="g"/></defs>')
    expect(out.indexOf('<defs>')).toBeLessThan(out.indexOf('<g transform='))
  })

  it('does not apply any fill override — Icon Composer owns appearance', () => {
    const out = layerAssetSvg(
      layer({
        overrides: {
          dark: { fill: { kind: 'solid', color: { space: 'srgb', components: [1, 0, 0, 1] } } },
        },
      }),
    )
    expect(out).not.toContain('mask')
    expect(out).not.toContain('rgb(')
  })
})
