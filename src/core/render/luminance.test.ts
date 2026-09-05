import { describe, expect, it } from 'vitest'
import type { Color } from '../model/types'
import { colorLuminance, monoColor, relativeLuminance } from './luminance'

const srgb = (r: number, g: number, b: number, a = 1): Color => ({
  space: 'srgb',
  components: [r, g, b, a],
})

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0)
    expect(relativeLuminance(1, 1, 1)).toBeCloseTo(1, 12)
  })

  it('linearizes sRGB before weighting (mid gray is far below 0.5)', () => {
    expect(relativeLuminance(0.5, 0.5, 0.5)).toBeCloseTo(0.214, 4)
    // the familiar 128/255 mid gray
    expect(relativeLuminance(128 / 255, 128 / 255, 128 / 255)).toBeCloseTo(0.2158, 3)
  })

  it('uses the Rec. 709 channel weights', () => {
    expect(relativeLuminance(1, 0, 0)).toBeCloseTo(0.2126, 6)
    expect(relativeLuminance(0, 1, 0)).toBeCloseTo(0.7152, 6)
    expect(relativeLuminance(0, 0, 1)).toBeCloseTo(0.0722, 6)
  })

  it('uses the linear segment near black', () => {
    expect(relativeLuminance(0.02, 0.02, 0.02)).toBeCloseTo(0.02 / 12.92, 9)
  })

  it('is monotonic', () => {
    let previous = -1
    for (let i = 0; i <= 10; i++) {
      const v = relativeLuminance(i / 10, i / 10, i / 10)
      expect(v).toBeGreaterThan(previous)
      previous = v
    }
  })
})

describe('colorLuminance', () => {
  it('reads the rgb components of an srgb color', () => {
    expect(colorLuminance(srgb(0, 1, 0))).toBeCloseTo(0.7152, 6)
  })

  it('treats a gray color as achromatic', () => {
    expect(colorLuminance({ space: 'gray', components: [1, 1] })).toBeCloseTo(1, 9)
    expect(colorLuminance({ space: 'gray', components: [0, 1] })).toBe(0)
    expect(colorLuminance({ space: 'gray', components: [0.5, 1] })).toBeCloseTo(0.214, 4)
  })

  it('treats display-p3 components as rgb', () => {
    expect(colorLuminance({ space: 'display-p3', components: [1, 1, 1, 1] })).toBeCloseTo(1, 9)
  })
})

describe('monoColor', () => {
  const tint = srgb(0.2, 0.6, 1)

  it('is white with a luminance-driven alpha for clearLight', () => {
    expect(monoColor(0, 'clearLight', tint)).toEqual({
      space: 'srgb',
      components: [1, 1, 1, 0.55],
    })
    const bright = monoColor(1, 'clearLight', tint)
    expect(bright.components.slice(0, 3)).toEqual([1, 1, 1])
    expect(bright.components[3]).toBeCloseTo(0.95, 9)
    expect(monoColor(0.5, 'clearLight', tint).components[3] as number).toBeCloseTo(0.75, 9)
  })

  it('is brighter for clearDark than clearLight', () => {
    for (const lum of [0, 0.5, 1]) {
      const light = monoColor(lum, 'clearLight', tint).components[3] as number
      const dark = monoColor(lum, 'clearDark', tint).components[3] as number
      expect(dark).toBeGreaterThan(light)
    }
    expect(monoColor(0, 'clearDark', tint).components[3]).toBeCloseTo(0.7, 9)
    expect(monoColor(1, 'clearDark', tint).components[3]).toBeCloseTo(1, 9)
  })

  it('scales the tint by luminance for tinted renditions', () => {
    for (const rendition of ['tintedLight', 'tintedDark'] as const) {
      const dim = monoColor(0, rendition, tint)
      expect(dim.space).toBe('srgb')
      expect(dim.components[0] as number).toBeCloseTo(0.2 * 0.35, 9)
      expect(dim.components[1] as number).toBeCloseTo(0.6 * 0.35, 9)
      expect(dim.components[2] as number).toBeCloseTo(1 * 0.35, 9)
      expect(dim.components[3]).toBe(1)

      const full = monoColor(1, rendition, tint)
      expect(full.components.slice(0, 3)).toEqual([0.2, 0.6, 1])
      expect(full.components[3]).toBe(1)
    }
  })

  it('scales a gray tint too', () => {
    const gray: Color = { space: 'gray', components: [0.8, 0.5] }
    const c = monoColor(1, 'tintedDark', gray)
    expect(c.space).toBe('gray')
    expect(c.components[0] as number).toBeCloseTo(0.8, 9)
    expect(c.components[1]).toBe(1)
  })

  it('returns the tint unchanged for default and dark', () => {
    expect(monoColor(0.3, 'default', tint)).toBe(tint)
    expect(monoColor(0.3, 'dark', tint)).toBe(tint)
  })
})
