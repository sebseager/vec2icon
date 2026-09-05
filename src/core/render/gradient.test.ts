import { describe, expect, it } from 'vitest'
import type { Color } from '../model/types'
import {
  AUTO_GRADIENT_DESATURATE,
  AUTO_GRADIENT_LIGHTEN,
  automaticGradientStops,
  linearGradientVector,
  wallpaperStops,
} from './gradient'
import type { Wallpaper } from './types'

const srgb = (r: number, g: number, b: number, a = 1): Color => ({
  space: 'srgb',
  components: [r, g, b, a],
})

const saturation = (c: Color): number => {
  const [r = 0, g = 0, b = 0] = c.components
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const l = (max + min) / 2
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
}

const lightness = (c: Color): number => {
  const [r = 0, g = 0, b = 0] = c.components
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2
}

describe('automatic gradient constants', () => {
  it('match the spec values', () => {
    expect(AUTO_GRADIENT_LIGHTEN).toBeCloseTo(0.25, 6)
    expect(AUTO_GRADIENT_DESATURATE).toBeCloseTo(0.15, 6)
  })
})

describe('automaticGradientStops', () => {
  const base = srgb(0.2, 0.4, 0.8)
  const [bottom, top] = automaticGradientStops(base)

  it('keeps the base color at the bottom', () => {
    expect(bottom).toEqual(base)
  })

  it('lightens the top stop', () => {
    expect(lightness(top)).toBeGreaterThan(lightness(bottom))
  })

  it('desaturates the top stop', () => {
    expect(saturation(top)).toBeLessThan(saturation(bottom))
    expect(saturation(top)).toBeCloseTo(saturation(bottom) * (1 - AUTO_GRADIENT_DESATURATE), 3)
  })

  it('lightens by the configured fraction of the remaining headroom', () => {
    const l = lightness(base)
    expect(lightness(top)).toBeCloseTo(l + (1 - l) * AUTO_GRADIENT_LIGHTEN, 3)
  })

  it('preserves the color space and alpha', () => {
    const [, translucentTop] = automaticGradientStops(srgb(0.2, 0.4, 0.8, 0.5))
    expect(translucentTop.space).toBe('srgb')
    expect(translucentTop.components).toHaveLength(4)
    expect(translucentTop.components[3]).toBe(0.5)
  })

  it('handles gray colors as a single component plus alpha', () => {
    const gray: Color = { space: 'gray', components: [0.4, 1] }
    const [grayBottom, grayTop] = automaticGradientStops(gray)
    expect(grayBottom).toEqual(gray)
    expect(grayTop.space).toBe('gray')
    expect(grayTop.components).toHaveLength(2)
    expect(grayTop.components[0] as number).toBeCloseTo(0.4 + 0.6 * AUTO_GRADIENT_LIGHTEN, 3)
    expect(grayTop.components[1]).toBe(1)
  })

  it('keeps display-p3 in display-p3', () => {
    const p3: Color = { space: 'display-p3', components: [0.9, 0.2, 0.1, 1] }
    const [, p3Top] = automaticGradientStops(p3)
    expect(p3Top.space).toBe('display-p3')
    expect(p3Top.components).toHaveLength(4)
  })

  it('leaves white unchanged at the top (no headroom)', () => {
    const [, whiteTop] = automaticGradientStops(srgb(1, 1, 1))
    expect(whiteTop.components.slice(0, 3)).toEqual([1, 1, 1])
  })
})

describe('linearGradientVector', () => {
  const round = (v: { x1: number; y1: number; x2: number; y2: number }) => ({
    x1: Number(v.x1.toFixed(4)),
    y1: Number(v.y1.toFixed(4)),
    x2: Number(v.x2.toFixed(4)),
    y2: Number(v.y2.toFixed(4)),
  })

  it('points bottom to top at 0 degrees', () => {
    expect(round(linearGradientVector(0))).toEqual({ x1: 0.5, y1: 1, x2: 0.5, y2: 0 })
  })

  it('points left to right at 90 degrees', () => {
    expect(round(linearGradientVector(90))).toEqual({ x1: 0, y1: 0.5, x2: 1, y2: 0.5 })
  })

  it('points top to bottom at 180 degrees', () => {
    expect(round(linearGradientVector(180))).toEqual({ x1: 0.5, y1: 0, x2: 0.5, y2: 1 })
  })

  it('points right to left at 270 degrees', () => {
    expect(round(linearGradientVector(270))).toEqual({ x1: 1, y1: 0.5, x2: 0, y2: 0.5 })
  })

  it('wraps angles beyond a full turn', () => {
    expect(round(linearGradientVector(450))).toEqual(round(linearGradientVector(90)))
    expect(round(linearGradientVector(-90))).toEqual(round(linearGradientVector(270)))
  })

  it('stays centred on the unit square', () => {
    for (const angle of [0, 17, 45, 123, 200, 359]) {
      const v = linearGradientVector(angle)
      expect((v.x1 + v.x2) / 2).toBeCloseTo(0.5, 9)
      expect((v.y1 + v.y2) / 2).toBeCloseTo(0.5, 9)
    }
  })
})

describe('wallpaperStops', () => {
  it('returns the checker sentinel for the checker wallpaper', () => {
    expect(wallpaperStops('checker')).toBe('checker')
  })

  it('returns two stops for every other wallpaper', () => {
    for (const w of ['light', 'dark', 'gradient-blue', 'gradient-warm'] as Wallpaper[]) {
      const stops = wallpaperStops(w)
      expect(stops).not.toBe('checker')
      const [bottom, top] = stops as [Color, Color]
      expect(bottom.space).toBe('srgb')
      expect(bottom.components).toHaveLength(4)
      expect(top.components).toHaveLength(4)
    }
  })

  it('makes the light wallpaper lighter than the dark one', () => {
    const [lightBottom] = wallpaperStops('light') as [Color, Color]
    const [darkBottom] = wallpaperStops('dark') as [Color, Color]
    expect(lightness(lightBottom)).toBeGreaterThan(lightness(darkBottom))
  })

  it('is opaque', () => {
    for (const w of ['light', 'dark', 'gradient-blue', 'gradient-warm'] as Wallpaper[]) {
      const [bottom, top] = wallpaperStops(w) as [Color, Color]
      expect(bottom.components[3]).toBe(1)
      expect(top.components[3]).toBe(1)
    }
  })
})
