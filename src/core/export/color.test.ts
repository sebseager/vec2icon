import { describe, expect, it } from 'vitest'
import type { Color } from '../model/types'
import { cssColor, formatComponent, hexToColor, parseColor, serializeColor } from './color'

const srgb = (r: number, g: number, b: number, a = 1): Color => ({
  space: 'srgb',
  components: [r, g, b, a],
})

describe('formatComponent', () => {
  it('always uses exactly 5 decimals', () => {
    expect(formatComponent(1)).toBe('1.00000')
    expect(formatComponent(0)).toBe('0.00000')
    expect(formatComponent(0.53333333)).toBe('0.53333')
    expect(formatComponent(0.196078431)).toBe('0.19608')
  })

  it('does not clamp — "extended" color spaces allow out-of-range components', () => {
    expect(formatComponent(1.2)).toBe('1.20000')
    expect(formatComponent(-0.5)).toBe('-0.50000')
  })

  it('never emits negative zero', () => {
    expect(formatComponent(-0)).toBe('0.00000')
    expect(formatComponent(-0.000001)).toBe('0.00000')
  })
})

describe('serializeColor', () => {
  it('serializes srgb as extended-srgb with 4 components', () => {
    expect(serializeColor(srgb(0, 0.53333, 1, 1))).toBe(
      'extended-srgb:0.00000,0.53333,1.00000,1.00000',
    )
  })

  it('serializes gray as extended-gray with 2 components', () => {
    expect(serializeColor({ space: 'gray', components: [1, 1] })).toBe(
      'extended-gray:1.00000,1.00000',
    )
  })

  it('serializes display-p3 under its own name', () => {
    expect(serializeColor({ space: 'display-p3', components: [1, 0.18845, 0.18108, 1] })).toBe(
      'display-p3:1.00000,0.18845,0.18108,1.00000',
    )
  })
})

describe('parseColor', () => {
  it('round trips every space', () => {
    const colors: Color[] = [
      srgb(0.1, 0.2, 0.3, 0.4),
      { space: 'gray', components: [0.25, 0.5] },
      { space: 'display-p3', components: [1, 0, 0.5, 1] },
    ]
    for (const c of colors) {
      expect(parseColor(serializeColor(c))).toEqual(c)
    }
  })

  it('accepts the non-extended spellings', () => {
    expect(parseColor('srgb:1,0,0,1')).toEqual(srgb(1, 0, 0, 1))
    expect(parseColor('gray:0.5,1')).toEqual({ space: 'gray', components: [0.5, 1] })
  })

  it('rejects malformed strings', () => {
    expect(parseColor('')).toBeNull()
    expect(parseColor('extended-srgb:1,0,0')).toBeNull()
    expect(parseColor('extended-gray:1,1,1')).toBeNull()
    expect(parseColor('named:system-blue')).toBeNull()
    expect(parseColor('cmyk:0,0,0,1')).toBeNull()
    expect(parseColor('extended-srgb:a,b,c,d')).toBeNull()
  })
})

describe('cssColor', () => {
  it('renders srgb as rgb() with 0..255 integers', () => {
    expect(cssColor(srgb(1, 0, 0, 1))).toBe('rgb(255 0 0 / 1)')
    expect(cssColor(srgb(0, 0.53333, 1, 0.5))).toBe('rgb(0 136 255 / 0.5)')
  })

  it('renders gray as three equal channels', () => {
    expect(cssColor({ space: 'gray', components: [1, 1] })).toBe('rgb(255 255 255 / 1)')
    expect(cssColor({ space: 'gray', components: [0, 0.25] })).toBe('rgb(0 0 0 / 0.25)')
  })

  it('renders display-p3 with the color() function', () => {
    expect(cssColor({ space: 'display-p3', components: [1, 0.5, 0, 1] })).toBe(
      'color(display-p3 1 0.5 0 / 1)',
    )
  })

  it('clamps out-of-range srgb components into the 0..255 range', () => {
    expect(cssColor(srgb(1.5, -0.2, 0.5, 2))).toBe('rgb(255 0 128 / 1)')
  })
})

describe('hexToColor', () => {
  it('parses #rgb, #rrggbb and #rrggbbaa', () => {
    expect(hexToColor('#f00')).toEqual(srgb(1, 0, 0, 1))
    expect(hexToColor('#ff0000')).toEqual(srgb(1, 0, 0, 1))
    expect(hexToColor('#00000080')).toEqual(srgb(0, 0, 0, 128 / 255))
  })

  it('is case insensitive and tolerates a missing #', () => {
    expect(hexToColor('#FFFFFF')).toEqual(srgb(1, 1, 1, 1))
    expect(hexToColor('ffffff')).toEqual(srgb(1, 1, 1, 1))
  })

  it('returns null for anything else', () => {
    expect(hexToColor('#ff')).toBeNull()
    expect(hexToColor('#gggggg')).toBeNull()
    expect(hexToColor('rgb(1,2,3)')).toBeNull()
  })
})
