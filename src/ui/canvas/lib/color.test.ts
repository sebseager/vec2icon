import { describe, expect, it } from 'vitest'
import { colorToHex, hexToColor } from './color'

describe('colorToHex', () => {
  it('writes sRGB components as a hex triplet', () => {
    expect(colorToHex({ space: 'srgb', components: [1, 0, 0, 1] })).toBe('#ff0000')
    expect(colorToHex({ space: 'srgb', components: [0, 0.5, 1, 1] })).toBe('#0080ff')
  })

  it('clamps out-of-range components', () => {
    expect(colorToHex({ space: 'srgb', components: [-1, 2, 0, 1] })).toBe('#00ff00')
  })

  it('expands gray to a neutral triplet', () => {
    expect(colorToHex({ space: 'gray', components: [0.5, 1] })).toBe('#808080')
  })
})

describe('hexToColor', () => {
  it('reads a hex triplet back, keeping the alpha', () => {
    expect(hexToColor('#0080ff', 0.5)).toEqual({
      space: 'srgb',
      components: [0, 128 / 255, 1, 0.5],
    })
  })

  it('falls back to black for malformed input', () => {
    expect(hexToColor('nope')).toEqual({ space: 'srgb', components: [0, 0, 0, 1] })
  })
})
