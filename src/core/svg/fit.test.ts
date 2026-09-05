import { describe, expect, it } from 'vitest'
import { createLayer } from '../model/defaults'
import { layerCanvasBBox } from '../model/geometry'
import type { BBox, Layer } from '../model/types'
import { fitLayersToCanvas } from './fit'

/** Source units are canvas points, so `bbox` is where the art lands before any transform. */
const layerAt = (bbox: BBox): Layer =>
  createLayer({ name: 'a', svg: '<g/>', defs: '', sourceViewBox: [0, 0, 1024, 1024], bbox })

const close = (a: BBox, b: BBox): void => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
  expect(a.width).toBeCloseTo(b.width, 6)
  expect(a.height).toBeCloseTo(b.height, 6)
}

describe('fitLayersToCanvas', () => {
  it('leaves art that already fits exactly where it is', () => {
    const layer = layerAt({ x: 100, y: 200, width: 300, height: 300 })
    const [fitted] = fitLayersToCanvas([layer])
    expect(fitted).toBe(layer)
  })

  it('scales overhanging art down to the canvas and centres it', () => {
    const [fitted] = fitLayersToCanvas([layerAt({ x: -512, y: 0, width: 2048, height: 1024 })])
    close(layerCanvasBBox(fitted as Layer), { x: 0, y: 256, width: 1024, height: 512 })
    expect(fitted?.transform.scaleX).toBeCloseTo(0.5)
    expect(fitted?.transform.rotation).toBe(0)
  })

  it('only moves art that fits but hangs off the edge', () => {
    const [fitted] = fitLayersToCanvas([layerAt({ x: 900, y: 900, width: 400, height: 200 })])
    close(layerCanvasBBox(fitted as Layer), { x: 312, y: 412, width: 400, height: 200 })
    expect(fitted?.transform.scaleX).toBe(1)
  })

  it('keeps several layers in the same arrangement', () => {
    const left = layerAt({ x: -1024, y: 0, width: 1024, height: 1024 })
    const right = layerAt({ x: 0, y: 0, width: 2048, height: 1024 })
    const [l, r] = fitLayersToCanvas([left, right])
    close(layerCanvasBBox(l as Layer), { x: 0, y: 341 + 1 / 3, width: 1024 / 3, height: 1024 / 3 })
    close(layerCanvasBBox(r as Layer), {
      x: 1024 / 3,
      y: 341 + 1 / 3,
      width: 2048 / 3,
      height: 1024 / 3,
    })
  })

  it('composes with a transform the layer already carries', () => {
    const base = layerAt({ x: 0, y: 0, width: 1024, height: 1024 })
    const turned = { ...base, transform: { ...base.transform, rotation: 45 } }
    const [fitted] = fitLayersToCanvas([turned])
    const box = layerCanvasBBox(fitted as Layer)
    expect(fitted?.transform.rotation).toBe(45)
    expect(box.x).toBeGreaterThanOrEqual(-1e-6)
    expect(box.x + box.width).toBeLessThanOrEqual(1024 + 1e-6)
    expect(box.width).toBeCloseTo(1024)
  })
})
