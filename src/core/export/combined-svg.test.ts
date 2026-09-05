import { describe, expect, it } from 'vitest'
import { createGroup, createLayer, emptyDoc } from '../model/defaults'
import type { Color, Fill, IconDoc, Layer } from '../model/types'
import { backgroundMarkup, combinedSvg } from './combined-svg'

const srgb = (r: number, g: number, b: number, a = 1): Color => ({
  space: 'srgb',
  components: [r, g, b, a],
})
const solid = (c: Color): Fill => ({ kind: 'solid', color: c })

const layer = (name: string, init: Partial<Layer> = {}): Layer =>
  createLayer({
    name,
    svg: `<g id="body"><title>${name}</title></g>`,
    defs: '',
    sourceViewBox: [0, 0, 1024, 1024],
    bbox: { x: 0, y: 0, width: 1024, height: 1024 },
    ...init,
  })

const noFillDoc = (...layers: Layer[]): IconDoc => ({
  ...emptyDoc(),
  fill: { default: { kind: 'none' } },
  groups: [createGroup('G', layers)],
})

describe('backgroundMarkup', () => {
  it('produces nothing for a none fill', () => {
    expect(backgroundMarkup({ kind: 'none' }, 'bg')).toEqual({ defs: '', rect: '' })
  })

  it('produces a plain rect for a solid fill', () => {
    const out = backgroundMarkup(solid(srgb(1, 0, 0)), 'bg')
    expect(out.defs).toBe('')
    expect(out.rect).toBe('<rect width="1024" height="1024" fill="rgb(255 0 0 / 1)"/>')
  })

  it('maps a 0-degree linear gradient to bottom -> top endpoints', () => {
    const out = backgroundMarkup(
      { kind: 'linear-gradient', colors: [srgb(0, 0, 0), srgb(1, 1, 1)], angle: 0 },
      'bg',
    )
    expect(out.defs).toContain('<linearGradient id="bg" x1="0.5" y1="1" x2="0.5" y2="0">')
    expect(out.defs).toContain('<stop offset="0" stop-color="rgb(0 0 0 / 1)"/>')
    expect(out.defs).toContain('<stop offset="1" stop-color="rgb(255 255 255 / 1)"/>')
    expect(out.rect).toBe('<rect width="1024" height="1024" fill="url(#bg)"/>')
  })

  it('maps a 90-degree linear gradient to left -> right endpoints', () => {
    const out = backgroundMarkup(
      { kind: 'linear-gradient', colors: [srgb(0, 0, 0), srgb(1, 1, 1)], angle: 90 },
      'bg',
    )
    expect(out.defs).toContain('x1="0" y1="0.5" x2="1" y2="0.5"')
  })

  it('derives a lighter, desaturated top stop for an automatic gradient', () => {
    const out = backgroundMarkup({ kind: 'automatic-gradient', color: srgb(0, 0, 0) }, 'bg')
    expect(out.defs).toContain('x1="0.5" y1="1" x2="0.5" y2="0"')
    // base at the bottom, mixed 25% toward white at the top -> 0.25 * 255 = 64
    expect(out.defs).toContain('<stop offset="0" stop-color="rgb(0 0 0 / 1)"/>')
    expect(out.defs).toContain('<stop offset="1" stop-color="rgb(64 64 64 / 1)"/>')
  })
})

describe('combinedSvg', () => {
  it('wraps everything in a 1024 canvas', () => {
    const out = combinedSvg(noFillDoc(layer('A')), { background: false })
    expect(
      out.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">',
      ),
    ).toBe(true)
    expect(out.endsWith('</svg>')).toBe(true)
  })

  it('paints bottom-most group and layer first, reversing document order', () => {
    const d = {
      ...noFillDoc(),
      groups: [createGroup('Top', [layer('A'), layer('B')]), createGroup('Bottom', [layer('C')])],
    }
    const out = combinedSvg(d, { background: false })
    expect(out.indexOf('>C<')).toBeLessThan(out.indexOf('>B<'))
    expect(out.indexOf('>B<')).toBeLessThan(out.indexOf('>A<'))
  })

  it('skips hidden layers and hidden groups', () => {
    const d = {
      ...noFillDoc(),
      groups: [
        createGroup('Visible', [layer('A', { hidden: true }), layer('B')]),
        { ...createGroup('Gone', [layer('C')]), hidden: true },
      ],
    }
    const out = combinedSvg(d, { background: false })
    expect(out).not.toContain('>A<')
    expect(out).toContain('>B<')
    expect(out).not.toContain('>C<')
  })

  it('includes the background rect only when asked', () => {
    const d = { ...noFillDoc(layer('A')), fill: { default: solid(srgb(1, 0, 0)) } }
    expect(combinedSvg(d, { background: true })).toContain(
      '<rect width="1024" height="1024" fill="rgb(255 0 0 / 1)"/>',
    )
    expect(combinedSvg(d, { background: false })).not.toContain('<rect')
  })

  it('uses the dark document fill for the dark appearance', () => {
    const d = {
      ...noFillDoc(layer('A')),
      fill: { default: solid(srgb(1, 0, 0)), dark: solid(srgb(0, 0, 1)) },
    }
    expect(combinedSvg(d, { background: true, appearance: 'dark' })).toContain(
      'fill="rgb(0 0 255 / 1)"',
    )
    expect(combinedSvg(d, { background: true })).toContain('fill="rgb(255 0 0 / 1)"')
  })

  it('prefixes ids per layer so two layers sharing an id stay isolated', () => {
    const out = combinedSvg(noFillDoc(layer('A'), layer('B')), { background: false })
    expect(out).toContain('id="l0-body"')
    expect(out).toContain('id="l1-body"')
    expect(out).not.toMatch(/id="body"/)
  })

  it('bakes the layer matrix into a transform', () => {
    const out = combinedSvg(noFillDoc(layer('A')), { background: false })
    expect(out).toContain('<g transform="matrix(')
  })

  it('emits opacity and mix-blend-mode only when non-default', () => {
    const plain = combinedSvg(noFillDoc(layer('A')), { background: false })
    expect(plain).not.toContain('opacity=')
    expect(plain).not.toContain('mix-blend-mode')

    const styled = combinedSvg(noFillDoc(layer('A', { opacity: 0.5, blendMode: 'multiply' })), {
      background: false,
    })
    expect(styled).toContain('opacity="0.5"')
    expect(styled).toContain('style="mix-blend-mode:multiply"')
  })

  it('applies group opacity and blend mode', () => {
    const d = {
      ...noFillDoc(),
      groups: [{ ...createGroup('G', [layer('A')]), opacity: 0.25, blendMode: 'screen' as const }],
    }
    const out = combinedSvg(d, { background: false })
    expect(out).toContain('opacity="0.25"')
    expect(out).toContain('style="mix-blend-mode:screen"')
  })

  it('honours dark overrides for hidden, opacity and fill', () => {
    const d = noFillDoc(
      layer('A', { overrides: { dark: { hidden: true } } }),
      layer('B', { overrides: { dark: { fill: solid(srgb(0, 1, 0)), opacity: 0.5 } } }),
    )
    const dark = combinedSvg(d, { background: false, appearance: 'dark' })
    expect(dark).not.toContain('>A<')
    expect(dark).toContain('<mask id="l1-fill-mask" style="mask-type:alpha">')
    expect(dark).toContain('mask="url(#l1-fill-mask)"')
    expect(dark).toContain('fill="rgb(0 255 0 / 1)"')
    expect(dark).toContain('opacity="0.5"')

    const light = combinedSvg(d, { background: false })
    expect(light).toContain('>A<')
    expect(light).not.toContain('mask')
  })

  it('paints nothing for a layer whose dark fill override is none', () => {
    const d = noFillDoc(layer('A', { overrides: { dark: { fill: { kind: 'none' } } } }), layer('B'))

    const dark = combinedSvg(d, { background: false, appearance: 'dark' })
    expect(dark).not.toContain('>A<')
    expect(dark).not.toContain('l0-')
    expect(dark).toContain('>B<')
    // the surviving layer keeps its document-order prefix
    expect(dark).toContain('id="l1-body"')

    // the override is dark-only: the default appearance still paints the layer
    expect(combinedSvg(d, { background: false })).toContain('>A<')
  })

  it('clips everything to the platform mask only when a platform is given', () => {
    const d = { ...noFillDoc(layer('A')), fill: { default: solid(srgb(1, 0, 0)) } }

    const plain = combinedSvg(d, { background: true })
    expect(plain).not.toContain('clipPath')

    const masked = combinedSvg(d, { background: true, platform: 'ios' })
    expect(masked).toContain('<clipPath id="platform-mask"><path d="M')
    expect(masked).toContain('<g clip-path="url(#platform-mask)">')
    // the background rect is inside the clip, so the PNG comes out icon-shaped
    expect(masked.indexOf('<g clip-path="url(#platform-mask)">')).toBeLessThan(
      masked.indexOf('<rect'),
    )
  })

  it('collects layer defs into a single top-level defs block', () => {
    const d = noFillDoc(layer('A', { defs: '<linearGradient id="g"/>' }))
    const out = combinedSvg(d, { background: false })
    expect(out).toContain('<defs><linearGradient id="l0-g"/></defs>')
    expect(out.indexOf('<defs>')).toBeLessThan(out.indexOf('<g transform='))
  })
})
