import { describe, expect, it } from 'vitest'
import { handlePositions, hitHandle, ROTATE_OFFSET_PX } from './handles'

const box = { x: 0, y: 0, width: 100, height: 100 }

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
