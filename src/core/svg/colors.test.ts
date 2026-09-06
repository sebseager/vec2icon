import { describe, expect, it } from 'vitest'
import { createLayer } from '../model/defaults'
import type { Color } from '../model/types'
import { colorKey, layerColors, recolorLayer } from './colors'

const layer = (svg: string, defs = '') =>
  createLayer({
    name: 'Art',
    svg,
    defs,
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 0, y: 0, width: 100, height: 100 },
  })

const BLUE: Color = { space: 'srgb', components: [0, 0, 1, 1] }

describe('colorKey', () => {
  it('is short hex when opaque and long hex otherwise', () => {
    expect(colorKey({ space: 'srgb', components: [1, 0, 0, 1] })).toBe('#ff0000')
    expect(colorKey({ space: 'srgb', components: [1, 0, 0, 0.5] })).toBe('#ff000080')
  })
})

describe('layerColors', () => {
  it('lists each distinct paint once, in first-seen order, counting its uses', () => {
    const colors = layerColors(
      layer(
        '<g fill="#F00"><rect width="1" height="1"/><circle r="1" fill="white" stroke="#ff0000"/><path d="M0 0" fill="#ffffff"/></g>',
      ),
    )
    expect(colors.map((c) => [c.key, c.uses])).toEqual([
      ['#ff0000', 2],
      ['#ffffff', 2],
    ])
  })

  it('includes gradient stops from the defs and skips none, url() and currentColor', () => {
    const colors = layerColors(
      layer(
        '<g><rect width="1" height="1" fill="url(#g)" stroke="none"/><path d="M0 0" fill="currentColor"/></g>',
        '<linearGradient id="g"><stop offset="0" stop-color="#123456"/><stop offset="1" stop-color="rgb(0, 0, 255)"/></linearGradient>',
      ),
    )
    expect(colors.map((c) => c.key)).toEqual(['#123456', '#0000ff'])
  })

  it('is empty for artwork with no colors of its own', () => {
    expect(layerColors(layer('<g><rect width="1" height="1"/></g>'))).toEqual([])
  })
})

describe('recolorLayer', () => {
  it('swaps every use of a color in the artwork and its defs, leaving the rest alone', () => {
    const before = layer(
      '<g fill="#F00"><rect width="1" height="1" stroke="red"/><circle r="1" fill="#00ff00"/></g>',
      '<linearGradient id="g"><stop offset="0" stop-color="#ff0000"/></linearGradient>',
    )
    const after = recolorLayer(before, '#ff0000', BLUE)
    expect(after.svg).toBe(
      '<g fill="#0000ff"><rect width="1" height="1" stroke="#0000ff"/><circle r="1" fill="#00ff00"/></g>',
    )
    expect(after.defs).toBe(
      '<linearGradient id="g"><stop offset="0" stop-color="#0000ff"/></linearGradient>',
    )
    expect(after.bbox).toEqual(before.bbox)
    expect(after.id).toBe(before.id)
  })

  it('writes long hex for a translucent replacement', () => {
    const after = recolorLayer(
      layer('<g><rect width="1" height="1" fill="#000"/></g>'),
      '#000000',
      {
        space: 'srgb',
        components: [0, 0, 1, 0.5],
      },
    )
    expect(after.svg).toContain('fill="#0000ff80"')
  })

  it('returns the same layer when the color is not used', () => {
    const before = layer('<g><rect width="1" height="1" fill="#000"/></g>')
    expect(recolorLayer(before, '#ff0000', BLUE)).toBe(before)
  })
})
