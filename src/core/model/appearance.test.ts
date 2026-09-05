import { describe, expect, it } from 'vitest'
import { appearanceCacheKey, docFill, renditionAppearance, resolveLayer } from './appearance'
import { createLayer, emptyDoc } from './defaults'
import type { Color, Fill, IconDoc, Layer } from './types'

const srgb = (r: number, g: number, b: number, a = 1): Color => ({
  space: 'srgb',
  components: [r, g, b, a],
})

const solid = (c: Color): Fill => ({ kind: 'solid', color: c })

const baseLayer = (over: Partial<Layer> = {}): Layer =>
  createLayer({
    name: 'L',
    svg: '<g><path d="M0 0h10v10h-10z"/></g>',
    defs: '',
    sourceViewBox: [0, 0, 10, 10],
    bbox: { x: 0, y: 0, width: 10, height: 10 },
    opacity: 0.8,
    blendMode: 'multiply',
    hidden: false,
    ...over,
  })

describe('resolveLayer', () => {
  it('returns base values with a null fill for the default appearance', () => {
    const layer = baseLayer()
    expect(resolveLayer(layer, 'default')).toEqual({
      fill: null,
      opacity: 0.8,
      hidden: false,
      blendMode: 'multiply',
    })
  })

  it('ignores dark/mono overrides for the default appearance', () => {
    const layer = baseLayer({
      overrides: { dark: { fill: solid(srgb(1, 0, 0)), opacity: 0.1, hidden: true } },
    })
    expect(resolveLayer(layer, 'default').fill).toBeNull()
    expect(resolveLayer(layer, 'default').opacity).toBe(0.8)
    expect(resolveLayer(layer, 'default').hidden).toBe(false)
  })

  it('merges the dark override over the base', () => {
    const fill = solid(srgb(0, 0, 1))
    const layer = baseLayer({ overrides: { dark: { fill, opacity: 0.25 } } })
    expect(resolveLayer(layer, 'dark')).toEqual({
      fill,
      opacity: 0.25,
      hidden: false,
      blendMode: 'multiply',
    })
  })

  it('falls back to base values for keys the dark override omits', () => {
    const layer = baseLayer({ overrides: { dark: {} } })
    expect(resolveLayer(layer, 'dark')).toEqual({
      fill: null,
      opacity: 0.8,
      hidden: false,
      blendMode: 'multiply',
    })
  })

  it('returns a null fill for mono when there is no mono fill override', () => {
    const layer = baseLayer({ overrides: { dark: { fill: solid(srgb(1, 0, 0)) } } })
    expect(resolveLayer(layer, 'mono').fill).toBeNull()
  })

  it('uses the mono override when present', () => {
    const fill: Fill = { kind: 'solid', color: { space: 'gray', components: [0.5, 1] } }
    const layer = baseLayer({
      overrides: { mono: { fill, blendMode: 'screen', hidden: true } },
    })
    expect(resolveLayer(layer, 'mono')).toEqual({
      fill,
      opacity: 0.8,
      hidden: true,
      blendMode: 'screen',
    })
  })

  it('honours an explicit `hidden: false` override on a hidden layer', () => {
    const layer = baseLayer({ hidden: true, overrides: { dark: { hidden: false } } })
    expect(resolveLayer(layer, 'dark').hidden).toBe(false)
  })
})

describe('renditionAppearance', () => {
  it('maps default and dark to themselves', () => {
    expect(renditionAppearance('default')).toBe('default')
    expect(renditionAppearance('dark')).toBe('dark')
  })

  it('maps every clear and tinted rendition to mono', () => {
    expect(renditionAppearance('clearLight')).toBe('mono')
    expect(renditionAppearance('clearDark')).toBe('mono')
    expect(renditionAppearance('tintedLight')).toBe('mono')
    expect(renditionAppearance('tintedDark')).toBe('mono')
  })
})

describe('docFill', () => {
  const withFills = (dark?: Fill): IconDoc => ({
    ...emptyDoc(),
    fill: { default: solid(srgb(1, 1, 1)), ...(dark ? { dark } : {}) },
  })

  it('returns the default fill for the default appearance', () => {
    expect(docFill(withFills(), 'default')).toEqual(solid(srgb(1, 1, 1)))
  })

  it('returns the dark fill for the dark appearance when present', () => {
    const dark = solid(srgb(0, 0, 0))
    expect(docFill(withFills(dark), 'dark')).toEqual(dark)
  })

  it('falls back to the default fill when no dark fill exists', () => {
    expect(docFill(withFills(), 'dark')).toEqual(solid(srgb(1, 1, 1)))
  })

  it('returns the default fill for the mono appearance', () => {
    expect(docFill(withFills(solid(srgb(0, 0, 0))), 'mono')).toEqual(solid(srgb(1, 1, 1)))
  })
})

describe('appearanceCacheKey', () => {
  it('is stable for equal inputs', () => {
    const a = resolveLayer(baseLayer(), 'default')
    const b = resolveLayer(baseLayer(), 'default')
    expect(appearanceCacheKey(a)).toBe(appearanceCacheKey(b))
  })

  it('differs when the fill differs', () => {
    const a = {
      fill: solid(srgb(1, 0, 0)),
      opacity: 1,
      hidden: false,
      blendMode: 'normal',
    } as const
    const b = {
      fill: solid(srgb(0, 1, 0)),
      opacity: 1,
      hidden: false,
      blendMode: 'normal',
    } as const
    expect(appearanceCacheKey(a)).not.toBe(appearanceCacheKey(b))
  })

  it('differs for a null fill versus a fill', () => {
    const a = { fill: null, opacity: 1, hidden: false, blendMode: 'normal' } as const
    const b = {
      fill: solid(srgb(1, 0, 0)),
      opacity: 1,
      hidden: false,
      blendMode: 'normal',
    } as const
    expect(appearanceCacheKey(a)).not.toBe(appearanceCacheKey(b))
  })

  it('differs when opacity, hidden or blend mode differ', () => {
    const base = { fill: null, opacity: 1, hidden: false, blendMode: 'normal' } as const
    expect(appearanceCacheKey({ ...base, opacity: 0.5 })).not.toBe(appearanceCacheKey(base))
    expect(appearanceCacheKey({ ...base, hidden: true })).not.toBe(appearanceCacheKey(base))
    expect(appearanceCacheKey({ ...base, blendMode: 'screen' })).not.toBe(appearanceCacheKey(base))
  })

  it('does not depend on the key insertion order of the fill color', () => {
    const a = appearanceCacheKey({
      fill: { kind: 'solid', color: { space: 'srgb', components: [1, 0, 0, 1] } },
      opacity: 1,
      hidden: false,
      blendMode: 'normal',
    })
    const b = appearanceCacheKey({
      fill: { color: { components: [1, 0, 0, 1], space: 'srgb' }, kind: 'solid' } as Fill,
      opacity: 1,
      hidden: false,
      blendMode: 'normal',
    })
    expect(a).toBe(b)
  })
})
