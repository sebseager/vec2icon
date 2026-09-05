import { describe, expect, it } from 'vitest'
import { createLayer } from '../model/defaults'
import type { Layer, ViewBox } from '../model/types'
import { backgroundFill, detectBackground, removeBackground } from './background'

const VB: ViewBox = [0, 0, 1024, 1024]

const layerOf = (svg: string, defs = '', sourceViewBox: ViewBox = VB): Layer =>
  createLayer({
    name: 'L',
    svg,
    defs,
    sourceViewBox,
    bbox: { x: 0, y: 0, width: sourceViewBox[2], height: sourceViewBox[3] },
  })

const round4 = (n: number) => Math.round(n * 10000) / 10000

describe('detectBackground', () => {
  it('detects a full-canvas rounded rect and reads its solid fill', () => {
    const found = detectBackground(
      layerOf('<g><rect width="1024" height="1024" rx="224" fill="#0A84FF"/></g>'),
    )
    expect(found?.element.localName).toBe('rect')
    expect(found?.fill).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [round4(10 / 255), round4(132 / 255), 1, 1] },
    })
  })

  it('detects a full-canvas circle', () => {
    const found = detectBackground(
      layerOf('<g><circle cx="512" cy="512" r="512" fill="white"/></g>'),
    )
    expect(found?.element.localName).toBe('circle')
    expect(found?.fill).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [1, 1, 1, 1] },
    })
  })

  it('detects a near-square rounded-rect path', () => {
    const found = detectBackground(
      layerOf(
        '<g><path d="M224 0 H800 A224 224 0 0 1 1024 224 V800 A224 224 0 0 1 800 1024 H224 A224 224 0 0 1 0 800 V224 A224 224 0 0 1 224 0 Z" fill="rgb(0, 0, 0)"/></g>',
      ),
    )
    expect(found?.element.localName).toBe('path')
    expect(found?.fill).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [0, 0, 0, 1] },
    })
  })

  it('rejects any shape whose bbox is far from square, even at full coverage', () => {
    const wide: ViewBox = [0, 0, 1024, 400]
    expect(
      detectBackground(layerOf('<g><path d="M0 0 H1024 V400 H0 Z" fill="#000"/></g>', '', wide)),
    ).toBeNull()
    expect(
      detectBackground(layerOf('<g><rect width="1024" height="400" fill="#000"/></g>', '', wide)),
    ).toBeNull()
    expect(
      detectBackground(
        layerOf('<g><ellipse cx="512" cy="200" rx="512" ry="200" fill="#000"/></g>', '', wide),
      ),
    ).toBeNull()
  })

  it('accepts a shape just inside the near-square tolerance', () => {
    const nearly: ViewBox = [0, 0, 1000, 1050]
    expect(
      detectBackground(
        layerOf('<g><rect width="1000" height="1050" fill="#000"/></g>', '', nearly),
      ),
    ).not.toBeNull()
  })

  it('rejects a shape that covers less than 90% of the viewBox', () => {
    expect(
      detectBackground(layerOf('<g><rect width="900" height="900" fill="#000"/></g>')),
    ).toBeNull()
  })

  it('accepts a shape just over the coverage threshold', () => {
    expect(
      detectBackground(layerOf('<g><rect width="1000" height="1000" fill="#000"/></g>')),
    ).not.toBeNull()
  })

  it('only ever looks at the bottom-most shape', () => {
    const found = detectBackground(
      layerOf(
        '<g><path d="M0 0 L100 0 L50 80 Z" fill="#f00"/><rect width="1024" height="1024" fill="#000"/></g>',
      ),
    )
    expect(found).toBeNull()
  })

  it('honours ancestor transforms when measuring coverage', () => {
    const found = detectBackground(
      layerOf('<g transform="scale(4)"><rect width="256" height="256" fill="#000"/></g>'),
    )
    expect(found?.element.localName).toBe('rect')
  })

  it('reads a linear gradient fill from the defs', () => {
    const found = detectBackground(
      layerOf(
        '<g><rect width="1024" height="1024" fill="url(#bg)"/></g>',
        '<linearGradient id="bg" x1="0" y1="1024" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ff006e"/><stop offset="1" stop-color="#3a86ff"/></linearGradient>',
      ),
    )
    expect(found?.fill).toEqual({
      kind: 'linear-gradient',
      colors: [
        { space: 'srgb', components: [1, 0, round4(110 / 255), 1] },
        { space: 'srgb', components: [round4(58 / 255), round4(134 / 255), 1, 1] },
      ],
      angle: 0,
    })
  })

  it('derives the gradient angle clockwise from bottom-to-top', () => {
    const angleOf = (x1: number, y1: number, x2: number, y2: number) => {
      const fill = backgroundFill(
        layerOf(
          '<g><rect width="1024" height="1024" fill="url(#g)"/></g>',
          `<linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>`,
        ),
      )
      return fill?.kind === 'linear-gradient' ? fill.angle : null
    }
    expect(angleOf(0, 10, 0, 0)).toBe(0) // bottom -> top
    expect(angleOf(0, 0, 10, 0)).toBe(90) // left -> right
    expect(angleOf(0, 0, 0, 10)).toBe(180) // top -> bottom
    expect(angleOf(10, 0, 0, 0)).toBe(270) // right -> left
  })

  it('follows a gradient href to inherit stops', () => {
    const fill = backgroundFill(
      layerOf(
        '<g><rect width="1024" height="1024" fill="url(#derived)"/></g>',
        '<linearGradient id="base"><stop stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient><linearGradient id="derived" href="#base" x1="0" y1="0" x2="10" y2="0"/>',
      ),
    )
    expect(fill?.kind).toBe('linear-gradient')
    if (fill?.kind !== 'linear-gradient') return
    expect(fill.angle).toBe(90)
    expect(fill.colors[1]).toEqual({ space: 'srgb', components: [1, 1, 1, 1] })
  })

  it('reports a background with no usable fill as fill: null', () => {
    const none = detectBackground(layerOf('<g><rect width="1024" height="1024" fill="none"/></g>'))
    expect(none?.element.localName).toBe('rect')
    expect(none?.fill).toBeNull()

    const unknown = detectBackground(
      layerOf('<g><rect width="1024" height="1024" fill="url(#missing)"/></g>'),
    )
    expect(unknown?.fill).toBeNull()
  })

  it('falls back to a fill inherited from the wrapper group', () => {
    const found = detectBackground(
      layerOf('<g fill="#0A84FF"><rect width="1024" height="1024"/></g>'),
    )
    expect(found?.fill).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [round4(10 / 255), round4(132 / 255), 1, 1] },
    })
  })

  it('lets the shape fill win over an inherited one', () => {
    const found = detectBackground(
      layerOf('<g fill="#0A84FF"><rect width="1024" height="1024" fill="#ffffff"/></g>'),
    )
    expect(found?.fill).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [1, 1, 1, 1] },
    })
  })

  it('reads an inherited gradient fill too', () => {
    const found = detectBackground(
      layerOf(
        '<g fill="url(#bg)"><rect width="1024" height="1024"/></g>',
        '<linearGradient id="bg" x1="0" y1="1024" x2="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>',
      ),
    )
    expect(found?.fill?.kind).toBe('linear-gradient')
  })

  it('returns null when the layer has no shapes at all', () => {
    expect(detectBackground(layerOf('<g></g>'))).toBeNull()
    expect(detectBackground(layerOf('<g><text>hi</text></g>'))).toBeNull()
  })
})

describe('backgroundFill', () => {
  it('is the fill of the detected background, or null', () => {
    expect(
      backgroundFill(layerOf('<g><rect width="1024" height="1024" fill="#fff"/></g>')),
    ).toEqual({ kind: 'solid', color: { space: 'srgb', components: [1, 1, 1, 1] } })
    expect(backgroundFill(layerOf('<g><rect width="10" height="10" fill="#fff"/></g>'))).toBeNull()
  })

  it('reads 3, 4, 6 and 8 digit hex and rgba()', () => {
    const solid = (fill: string) =>
      backgroundFill(layerOf(`<g><rect width="1024" height="1024" fill="${fill}"/></g>`))
    expect(solid('#f00')).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [1, 0, 0, 1] },
    })
    expect(solid('#ff000080')).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [1, 0, 0, round4(128 / 255)] },
    })
    expect(solid('#0f08')).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [0, 1, 0, round4(136 / 255)] },
    })
    expect(solid('rgba(255, 0, 0, 0.5)')).toEqual({
      kind: 'solid',
      color: { space: 'srgb', components: [1, 0, 0, 0.5] },
    })
  })
})

describe('removeBackground', () => {
  it('drops the background element and re-measures the layer', () => {
    const layer = layerOf(
      '<g><rect width="1024" height="1024" fill="#000"/><rect x="400" y="400" width="100" height="100" fill="#fff"/></g>',
    )
    const stripped = removeBackground(layer)
    expect(stripped.svg).toBe('<g><rect x="400" y="400" width="100" height="100" fill="#fff"/></g>')
    expect(stripped.bbox).toEqual({ x: 400, y: 400, width: 100, height: 100 })
    expect(stripped.id).toBe(layer.id)
  })

  it('drops defs the removed shape was the only user of', () => {
    const layer = layerOf(
      '<g><rect width="1024" height="1024" fill="url(#bg)"/><circle cx="512" cy="512" r="100" fill="#fff"/></g>',
      '<linearGradient id="bg" x1="0" y1="1024" x2="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>',
    )
    const stripped = removeBackground(layer)
    expect(stripped.defs).toBe('')
    expect(stripped.svg).toBe('<g><circle cx="512" cy="512" r="100" fill="#fff"/></g>')
  })

  it('keeps defs that the remaining artwork still references', () => {
    const defs =
      '<linearGradient id="bg" x1="0" y1="1024" x2="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>'
    const layer = layerOf(
      '<g><rect width="1024" height="1024" fill="url(#bg)"/><circle cx="512" cy="512" r="100" fill="url(#bg)"/></g>',
      defs,
    )
    expect(removeBackground(layer).defs).toBe(defs)
  })

  it('leaves a layer without a background alone', () => {
    const layer = layerOf('<g><rect x="10" y="10" width="10" height="10" fill="#000"/></g>')
    expect(removeBackground(layer)).toEqual(layer)
  })
})
