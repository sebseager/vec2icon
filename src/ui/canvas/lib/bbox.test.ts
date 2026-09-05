import { describe, expect, it } from 'vitest'
import { bboxCenter, containsPoint, unionBBox } from './bbox'

describe('containsPoint', () => {
  const box = { x: 10, y: 20, width: 100, height: 50 }

  it('accepts a point inside', () => {
    expect(containsPoint(box, { x: 50, y: 40 })).toBe(true)
  })

  it('accepts points on the edges', () => {
    expect(containsPoint(box, { x: 10, y: 20 })).toBe(true)
    expect(containsPoint(box, { x: 110, y: 70 })).toBe(true)
  })

  it('rejects points outside', () => {
    expect(containsPoint(box, { x: 9.9, y: 40 })).toBe(false)
    expect(containsPoint(box, { x: 50, y: 70.1 })).toBe(false)
  })
})

describe('bboxCenter', () => {
  it('is the middle of the box', () => {
    expect(bboxCenter({ x: 10, y: 20, width: 100, height: 50 })).toEqual({ x: 60, y: 45 })
  })
})

describe('unionBBox', () => {
  it('returns null for no boxes', () => {
    expect(unionBBox([])).toBeNull()
  })

  it('returns the single box unchanged', () => {
    const box = { x: 1, y: 2, width: 3, height: 4 }
    expect(unionBBox([box])).toEqual(box)
  })

  it('covers every box', () => {
    expect(
      unionBBox([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 20, y: -5, width: 10, height: 10 },
      ]),
    ).toEqual({ x: 0, y: -5, width: 30, height: 15 })
  })
})
