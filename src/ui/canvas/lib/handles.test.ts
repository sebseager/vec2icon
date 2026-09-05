import { describe, expect, it } from 'vitest'
import { createLayer } from '@/core/model/defaults'
import { frameFromBBox, layerFrame } from './frame'
import { handlePositions, hitHandle, ROTATE_OFFSET_PX } from './handles'

const box = frameFromBBox({ x: 0, y: 0, width: 100, height: 100 })

describe('handlePositions', () => {
  it('puts one handle at each corner', () => {
    const p = handlePositions(box, 1)
    expect(p.nw).toEqual({ x: 0, y: 0 })
    expect(p.ne).toEqual({ x: 100, y: 0 })
    expect(p.sw).toEqual({ x: 0, y: 100 })
    expect(p.se).toEqual({ x: 100, y: 100 })
  })

  it('puts the rotate handle above the top edge centre, in screen pixels', () => {
    expect(handlePositions(box, 1).rotate).toEqual({ x: 50, y: -ROTATE_OFFSET_PX })
    expect(handlePositions(box, 2).rotate).toEqual({ x: 50, y: -ROTATE_OFFSET_PX * 2 })
  })
})

describe('hitHandle', () => {
  it('finds a corner handle', () => {
    expect(hitHandle(box, { x: 100, y: 100 }, 1)).toBe('se')
    expect(hitHandle(box, { x: 0, y: 100 }, 1)).toBe('sw')
  })

  it('finds the rotate handle', () => {
    expect(hitHandle(box, { x: 50, y: -ROTATE_OFFSET_PX }, 1)).toBe('rotate')
  })

  it('returns null away from every handle', () => {
    expect(hitHandle(box, { x: 50, y: 50 }, 1)).toBeNull()
  })

  it('scales the hit radius with the zoom level', () => {
    expect(hitHandle(box, { x: 105, y: 105 }, 1)).toBeNull()
    expect(hitHandle(box, { x: 105, y: 105 }, 2)).toBe('se')
  })
})

describe('on a rotated layer', () => {
  /** A 200×100 box centred on the canvas, turned a quarter turn clockwise. */
  const turned = layerFrame(
    createLayer({
      name: 'turned',
      svg: '<g/>',
      defs: '',
      sourceViewBox: [0, 0, 1024, 1024],
      bbox: { x: 412, y: 462, width: 200, height: 100 },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 90 },
    }),
  )

  it('turns the frame with the artwork', () => {
    expect(turned.angle).toBeCloseTo(90)
    expect(turned.corners.nw.x).toBeCloseTo(562)
    expect(turned.corners.nw.y).toBeCloseTo(412)
    expect(turned.corners.se.x).toBeCloseTo(462)
    expect(turned.corners.se.y).toBeCloseTo(612)
  })

  it('keeps the rotate handle out of the turned top edge', () => {
    const p = handlePositions(turned, 1)
    expect(p.rotate.x).toBeCloseTo(562 + ROTATE_OFFSET_PX)
    expect(p.rotate.y).toBeCloseTo(512)
    expect(hitHandle(turned, p.rotate, 1)).toBe('rotate')
    expect(hitHandle(turned, { x: 562, y: 412 }, 1)).toBe('nw')
  })
})
