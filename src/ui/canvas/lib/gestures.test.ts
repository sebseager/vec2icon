import { describe, expect, it } from 'vitest'
import { identityTransform } from '@/core/model/defaults'
import {
  angleFromTop,
  applyRotation,
  applyScale,
  MIN_SCALE,
  normalizeAngle,
  pointerAngle,
  rotateDelta,
  scaleFactors,
  snapToStep,
} from './gestures'

const origin = { x: 0, y: 0 }

describe('pointerAngle', () => {
  it('measures degrees clockwise from the +x axis in a y-down space', () => {
    expect(pointerAngle(origin, { x: 10, y: 0 })).toBeCloseTo(0)
    expect(pointerAngle(origin, { x: 0, y: 10 })).toBeCloseTo(90)
    expect(pointerAngle(origin, { x: -10, y: 0 })).toBeCloseTo(180)
  })
})

describe('normalizeAngle', () => {
  it('wraps into 0..360', () => {
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(370)).toBe(10)
    expect(normalizeAngle(360)).toBe(0)
  })
})

describe('snapToStep', () => {
  it('rounds to the nearest step', () => {
    expect(snapToStep(97, 15)).toBe(90)
    expect(snapToStep(98, 15)).toBe(105)
    expect(snapToStep(-7, 15)).toBe(-0)
  })
})

describe('rotateDelta and applyRotation', () => {
  const sweep = { pivot: origin, startPointer: { x: 100, y: 0 }, pointer: { x: 0, y: 100 } }

  it('is the pointer sweep, added to every layer alike', () => {
    const delta = rotateDelta({ ...sweep, startRotation: 10, snap: false })
    expect(delta).toBeCloseTo(90)
    const held = applyRotation({ ...identityTransform(), rotation: 10 }, delta, origin, origin)
    expect(held.rotation).toBeCloseTo(100)
    expect(held.x).toBeCloseTo(0)
    expect(held.y).toBeCloseTo(0)
    expect(
      applyRotation({ ...identityTransform(), rotation: 45 }, delta, origin, origin).rotation,
    ).toBeCloseTo(135)
  })

  it('orbits the other layers about the held layer so the selection turns as one piece', () => {
    const delta = rotateDelta({ ...sweep, startRotation: 0, snap: false })
    // a layer 100 to the right of the pivot ends 100 below it after a quarter turn clockwise
    const other = applyRotation(
      { ...identityTransform(), x: 5, y: 7 },
      delta,
      { x: 100, y: 0 },
      origin,
    )
    expect(other.rotation).toBeCloseTo(90)
    expect(other.x).toBeCloseTo(5 - 100)
    expect(other.y).toBeCloseTo(7 + 100)
  })

  it('snaps the held layer to a 15 degree step and turns the rest by that same amount', () => {
    const delta = rotateDelta({ ...sweep, startRotation: 10, snap: true })
    expect(delta).toBe(95)
    expect(
      applyRotation({ ...identityTransform(), rotation: 10 }, delta, origin, origin).rotation,
    ).toBe(105)
    // the other layer keeps its offset from the held one rather than snapping itself
    expect(
      applyRotation({ ...identityTransform(), rotation: 12 }, delta, origin, origin).rotation,
    ).toBe(107)
  })

  it('wraps past a full turn', () => {
    const delta = rotateDelta({ ...sweep, startRotation: 350, snap: false })
    expect(
      applyRotation({ ...identityTransform(), rotation: 350 }, delta, origin, origin).rotation,
    ).toBeCloseTo(80)
  })
})

describe('scaleFactors and applyScale', () => {
  const start = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }

  it('is a ratio that goes onto any layer, whatever its starting scale', () => {
    const factors = scaleFactors({
      startTransform: start,
      pivot: { x: 0, y: 0 },
      startPointer: { x: 10, y: 0 },
      pointer: { x: 30, y: 0 },
      freeAxis: false,
    })
    expect(factors).toEqual({ x: 3, y: 3 })
    expect(applyScale({ ...start, scaleX: 0.5, scaleY: 2 }, factors, origin, origin)).toEqual({
      scaleX: 1.5,
      scaleY: 6,
      x: 0,
      y: 0,
    })
  })

  it('draws the other layers toward the held layer so the gaps scale with them', () => {
    const factors = { x: 0.5, y: 2 }
    // a layer 100 right and 40 below the pivot ends 50 right and 80 below it
    expect(applyScale({ ...start, x: 3, y: 4 }, factors, { x: 100, y: 40 }, origin)).toEqual({
      scaleX: 0.5,
      scaleY: 2,
      x: 3 - 50,
      y: 4 + 40,
    })
  })

  it('clamps each layer on its own', () => {
    expect(
      applyScale({ ...start, scaleX: 0.02, scaleY: 1 }, { x: 0.1, y: 0.1 }, origin, origin),
    ).toMatchObject({
      scaleX: MIN_SCALE,
      scaleY: 0.1,
    })
  })
})

describe('scaleFactors', () => {
  const start = { ...identityTransform(), scaleX: 1.5, scaleY: 1.5 }

  it('is the pointer distance ratio on both axes', () => {
    expect(
      scaleFactors({
        startTransform: start,
        pivot: origin,
        startPointer: { x: 100, y: 0 },
        pointer: { x: 200, y: 0 },
        freeAxis: false,
      }),
    ).toEqual({ x: 2, y: 2 })
  })

  it('stays at 1 when the handle sits on the pivot', () => {
    expect(
      scaleFactors({
        startTransform: start,
        pivot: origin,
        startPointer: origin,
        pointer: { x: 50, y: 50 },
        freeAxis: false,
      }),
    ).toEqual({ x: 1, y: 1 })
  })

  it('measures each axis on its own when freeAxis is set', () => {
    const factors = scaleFactors({
      startTransform: start,
      pivot: origin,
      startPointer: { x: 100, y: 50 },
      pointer: { x: 200, y: 50 },
      freeAxis: true,
    })
    expect(factors.x).toBeCloseTo(2)
    expect(factors.y).toBeCloseTo(1)
  })

  it('falls back to uniform on a rotated layer', () => {
    const factors = scaleFactors({
      startTransform: { ...start, rotation: 30 },
      pivot: origin,
      startPointer: { x: 100, y: 0 },
      pointer: { x: 200, y: 0 },
      freeAxis: true,
    })
    expect(factors.x).toBeCloseTo(2)
    expect(factors.y).toBeCloseTo(2)
  })

  it('applies with a floor at the minimum scale', () => {
    const factors = scaleFactors({
      startTransform: start,
      pivot: origin,
      startPointer: { x: 100, y: 0 },
      pointer: { x: 0.0001, y: 0 },
      freeAxis: false,
    })
    expect(applyScale(start, factors, origin, origin)).toMatchObject({
      scaleX: MIN_SCALE,
      scaleY: MIN_SCALE,
    })
  })
})

describe('angleFromTop', () => {
  it('reads 0 straight up and grows clockwise', () => {
    expect(angleFromTop({ x: 0, y: 0 }, { x: 0, y: -10 })).toBeCloseTo(0)
    expect(angleFromTop({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90)
    expect(angleFromTop({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(180)
    expect(angleFromTop({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270)
  })
})
