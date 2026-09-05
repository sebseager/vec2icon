import { describe, expect, it } from 'vitest'
import { safeArea } from '@/core/render/shapes'
import { SNAP_TOLERANCE, snapMove } from './snap'

const safe = safeArea('ios')

describe('snapMove', () => {
  it('leaves the delta alone when nothing is in range', () => {
    const box = { x: 400, y: 400, width: 100, height: 100 }
    expect(snapMove(box, { dx: 20, dy: 30 }, safe)).toEqual({ dx: 20, dy: 30 })
  })

  it('snaps the box centre to the canvas centre', () => {
    const box = { x: 400, y: 400, width: 100, height: 100 }
    const moved = snapMove(box, { dx: 60, dy: 60 }, safe)
    expect(moved.dx).toBeCloseTo(62)
    expect(moved.dy).toBeCloseTo(62)
  })

  it('snaps the leading edges to the safe area', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 }
    const moved = snapMove(box, { dx: 100, dy: 0 }, safe)
    expect(moved.dx).toBeCloseTo(safe.x)
    expect(moved.dy).toBe(0)
  })

  it('snaps the trailing edges to the safe area', () => {
    const box = { x: 800, y: 800, width: 100, height: 100 }
    const moved = snapMove(box, { dx: 20, dy: 20 }, safe)
    expect(moved.dx).toBeCloseTo(safe.x + safe.width - 900)
    expect(moved.dy).toBeCloseTo(safe.y + safe.height - 900)
  })

  it('picks the nearest of several candidates', () => {
    const box = { x: 105, y: 105, width: 812, height: 812 }
    // left edge is 2.6 away from the safe edge, centre is 1 away from the canvas centre
    const moved = snapMove(box, { dx: 0, dy: 0 }, safe)
    expect(moved.dx).toBeCloseTo(1)
    expect(moved.dy).toBeCloseTo(1)
  })

  it('snaps each axis independently', () => {
    const box = { x: 400, y: 0, width: 100, height: 100 }
    const moved = snapMove(box, { dx: 60, dy: 500 }, safe)
    expect(moved.dx).toBeCloseTo(62)
    expect(moved.dy).toBe(500)
  })

  it('ignores candidates further away than the tolerance', () => {
    const box = { x: 400, y: 400, width: 100, height: 100 }
    const moved = snapMove(box, { dx: 62 + SNAP_TOLERANCE + 0.5, dy: 0 }, safe)
    expect(moved.dx).toBeCloseTo(62 + SNAP_TOLERANCE + 0.5)
  })
})
