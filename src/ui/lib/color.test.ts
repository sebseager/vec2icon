import { describe, expect, it } from 'vitest'
import { hexToColor } from '@/core/export/color'
import {
  alphaOf,
  colorToHex,
  colorToHex8,
  grayColor,
  grayLevel,
  solidColor,
  toGrayColor,
  toSrgbColor,
  withAlpha,
} from './color'

describe('colorToHex', () => {
  it('renders an srgb color as #rrggbb', () => {
    expect(colorToHex({ space: 'srgb', components: [1, 0.5, 0, 1] })).toBe('#ff8000')
  })

  it('round-trips through hexToColor', () => {
    const color = hexToColor('#0a84ff')
    expect(color).not.toBeNull()
    expect(colorToHex(color as never)).toBe('#0a84ff')
  })

  it('renders a gray color as a neutral hex', () => {
    expect(colorToHex(grayColor(1, 0.5))).toBe('#ffffff')
  })

  it('clamps components outside 0..1', () => {
    expect(colorToHex({ space: 'srgb', components: [2, -1, 0, 1] })).toBe('#ff0000')
  })
})

describe('alpha', () => {
  it('reads the last component of an rgb color', () => {
    expect(alphaOf({ space: 'srgb', components: [0, 0, 0, 0.25] })).toBe(0.25)
  })

  it('reads the second component of a gray color', () => {
    expect(alphaOf(grayColor(0.5, 0.75))).toBe(0.75)
  })

  it('replaces alpha without touching the other components', () => {
    expect(withAlpha({ space: 'srgb', components: [1, 0, 0, 1] }, 0.5)).toEqual({
      space: 'srgb',
      components: [1, 0, 0, 0.5],
    })
    expect(withAlpha(grayColor(0.2, 1), 0.4)).toEqual(grayColor(0.2, 0.4))
  })
})

describe('gray', () => {
  it('builds and reads a white level', () => {
    expect(grayColor(0.6, 1)).toEqual({ space: 'gray', components: [0.6, 1] })
    expect(grayLevel(grayColor(0.6, 1))).toBe(0.6)
  })

  it('reads a white level from an rgb color as its luminance', () => {
    expect(grayLevel({ space: 'srgb', components: [0.25, 0.25, 0.25, 1] })).toBe(0.25)
    expect(grayLevel({ space: 'srgb', components: [1, 0, 0, 1] })).toBeCloseTo(0.2126, 4)
  })
})

describe('space conversion', () => {
  it('spreads a gray level across the rgb channels, keeping alpha', () => {
    expect(toSrgbColor(grayColor(0.4, 0.6))).toEqual({
      space: 'srgb',
      components: [0.4, 0.4, 0.4, 0.6],
    })
  })

  it('leaves a color that is already rgb alone', () => {
    const color = { space: 'srgb' as const, components: [1, 0, 0, 1] }
    expect(toSrgbColor(color)).toBe(color)
  })

  it('collapses an rgb color to its luminance as a gray, keeping alpha', () => {
    const gray = toGrayColor({ space: 'srgb', components: [1, 1, 1, 0.5] })
    expect(gray.space).toBe('gray')
    expect(gray.components[0]).toBeCloseTo(1, 5)
    expect(gray.components[1]).toBe(0.5)
  })

  it('leaves a color that is already gray alone', () => {
    const color = grayColor(0.2, 1)
    expect(toGrayColor(color)).toBe(color)
  })
})

describe('solidColor', () => {
  it('parses a hex string, keeping the given alpha', () => {
    expect(solidColor('#ff0000', 0.5)).toEqual({ space: 'srgb', components: [1, 0, 0, 0.5] })
  })

  it('falls back to opaque black for junk', () => {
    expect(solidColor('nope', 1)).toEqual({ space: 'srgb', components: [0, 0, 0, 1] })
  })
})

describe('colorToHex8', () => {
  it('appends the alpha byte', () => {
    expect(colorToHex8({ space: 'srgb', components: [1, 0.5, 0, 0.5] })).toBe('#ff800080')
  })

  it('renders a gray color with its own alpha', () => {
    expect(colorToHex8(grayColor(1, 0))).toBe('#ffffff00')
  })
})
