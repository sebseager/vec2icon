import { describe, expect, it } from 'vitest'
import {
  applyToPoint,
  fitViewBox,
  IDENTITY,
  invert,
  layerCanvasBBox,
  layerMatrix,
  layerPivot,
  matrixToSvg,
  multiply,
  rotate,
  scale,
  transformBBox,
  translate,
} from './geometry'
import type { BBox, Layer, Transform, ViewBox } from './types'

const identityTransform = (): Transform => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })

const makeLayer = (
  sourceViewBox: ViewBox,
  bbox: BBox,
  transform: Transform = identityTransform(),
): Pick<Layer, 'sourceViewBox' | 'bbox' | 'transform'> => ({ sourceViewBox, bbox, transform })

describe('fitViewBox', () => {
  it('fits a wide viewBox: scale by 1024/maxDim, center maps to canvas center', () => {
    const m = fitViewBox([0, 0, 200, 100])
    expect(m.a).toBeCloseTo(5.12)
    expect(m.d).toBeCloseTo(5.12)
    expect(m.b).toBe(0)
    expect(m.c).toBe(0)
    const center = applyToPoint(m, { x: 100, y: 50 })
    expect(center.x).toBeCloseTo(512)
    expect(center.y).toBeCloseTo(512)
  })

  it('handles a non-zero-origin viewBox', () => {
    const m = fitViewBox([50, 25, 200, 100])
    expect(m.a).toBeCloseTo(5.12)
    const center = applyToPoint(m, { x: 150, y: 75 }) // viewBox center
    expect(center.x).toBeCloseTo(512)
    expect(center.y).toBeCloseTo(512)
  })

  it('fits a tall viewBox using the larger dimension', () => {
    const m = fitViewBox([0, 0, 100, 200])
    expect(m.a).toBeCloseTo(5.12)
    expect(m.d).toBeCloseTo(5.12)
  })
})

describe('layerMatrix', () => {
  it('with an identity transform equals the fit matrix', () => {
    const layer = makeLayer([0, 0, 200, 100], { x: 50, y: 25, width: 100, height: 50 })
    const m = layerMatrix(layer)
    const fit = fitViewBox(layer.sourceViewBox)
    expect(m.a).toBeCloseTo(fit.a)
    expect(m.b).toBeCloseTo(fit.b)
    expect(m.c).toBeCloseTo(fit.c)
    expect(m.d).toBeCloseTo(fit.d)
    expect(m.e).toBeCloseTo(fit.e)
    expect(m.f).toBeCloseTo(fit.f)
  })

  it('translation moves the canvas bbox by (x, y)', () => {
    const bbox: BBox = { x: 0, y: 0, width: 100, height: 100 }
    const layer = makeLayer([0, 0, 200, 200], bbox)
    const base = layerCanvasBBox(layer)

    const moved = makeLayer([0, 0, 200, 200], bbox, {
      x: 10,
      y: -20,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    })
    const movedBBox = layerCanvasBBox(moved)

    expect(movedBBox.x).toBeCloseTo(base.x + 10)
    expect(movedBBox.y).toBeCloseTo(base.y - 20)
    expect(movedBBox.width).toBeCloseTo(base.width)
    expect(movedBBox.height).toBeCloseTo(base.height)
  })

  it('scale 2 doubles the canvas bbox size around the pivot', () => {
    const bbox: BBox = { x: 0, y: 0, width: 100, height: 50 }
    const layer = makeLayer([0, 0, 200, 200], bbox)
    const pivot = layerPivot(layer)
    const base = layerCanvasBBox(layer)

    const scaled = makeLayer([0, 0, 200, 200], bbox, {
      x: 0,
      y: 0,
      scaleX: 2,
      scaleY: 2,
      rotation: 0,
    })
    const scaledBBox = layerCanvasBBox(scaled)

    expect(scaledBBox.width).toBeCloseTo(base.width * 2)
    expect(scaledBBox.height).toBeCloseTo(base.height * 2)
    // still centered on the same pivot
    expect(scaledBBox.x + scaledBBox.width / 2).toBeCloseTo(pivot.x)
    expect(scaledBBox.y + scaledBBox.height / 2).toBeCloseTo(pivot.y)
  })

  it('rotation 90 of a non-square bbox swaps width and height', () => {
    const bbox: BBox = { x: 0, y: 0, width: 100, height: 40 }
    const layer = makeLayer([0, 0, 200, 200], bbox)
    const base = layerCanvasBBox(layer)

    const rotated = makeLayer([0, 0, 200, 200], bbox, {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 90,
    })
    const rotatedBBox = layerCanvasBBox(rotated)

    expect(rotatedBBox.width).toBeCloseTo(base.height)
    expect(rotatedBBox.height).toBeCloseTo(base.width)
  })
})

describe('transformBBox', () => {
  it('computes the AABB of the 4 transformed corners', () => {
    const b: BBox = { x: 0, y: 0, width: 10, height: 20 }
    const m = rotate(90)
    const result = transformBBox(m, b)
    expect(result.width).toBeCloseTo(20)
    expect(result.height).toBeCloseTo(10)
  })
})

describe('matrixToSvg', () => {
  it('formats with up to 6 decimals and no trailing zeros', () => {
    expect(matrixToSvg(IDENTITY)).toBe('matrix(1 0 0 1 0 0)')
    expect(matrixToSvg({ a: 5.12, b: 0, c: 0, d: 5.12, e: 0, f: 256 })).toBe(
      'matrix(5.12 0 0 5.12 0 256)',
    )
    // rounds to 6 decimals
    const m = { a: 1 / 3, b: 0, c: 0, d: 1, e: 0, f: 0 }
    expect(matrixToSvg(m)).toBe('matrix(0.333333 0 0 1 0 0)')
  })

  it('does not emit negative zero', () => {
    const m = { a: 1, b: -0, c: 0, d: 1, e: 0, f: 0 }
    expect(matrixToSvg(m)).toBe('matrix(1 0 0 1 0 0)')
  })
})

describe('multiply / translate / scale / rotate', () => {
  it('multiply(m1, m2) applies m2 first, then m1', () => {
    const m = multiply(translate(10, 0), scale(2, 2))
    const p = applyToPoint(m, { x: 1, y: 1 })
    // scale first: (2, 2), then translate: (12, 2)
    expect(p.x).toBeCloseTo(12)
    expect(p.y).toBeCloseTo(2)
  })

  it('rotate(90) rotates clockwise', () => {
    const m = rotate(90)
    const p = applyToPoint(m, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(1)
  })
})

describe('invert', () => {
  it('invert(m) . m is approximately IDENTITY', () => {
    const m = multiply(multiply(translate(12, -7), rotate(37)), scale(1.5, 0.8))
    const combined = multiply(invert(m), m)
    expect(combined.a).toBeCloseTo(IDENTITY.a)
    expect(combined.b).toBeCloseTo(IDENTITY.b)
    expect(combined.c).toBeCloseTo(IDENTITY.c)
    expect(combined.d).toBeCloseTo(IDENTITY.d)
    expect(combined.e).toBeCloseTo(IDENTITY.e)
    expect(combined.f).toBeCloseTo(IDENTITY.f)
  })
})
