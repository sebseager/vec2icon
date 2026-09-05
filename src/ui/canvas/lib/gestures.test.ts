import { describe, expect, it } from 'vitest'
import { identityTransform } from '@/core/model/defaults'
import {
  angleFromTop,
  MIN_SCALE,
  normalizeAngle,
  pointerAngle,
  rotateResult,
  scaleResult,
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

describe('rotateResult', () => {
  it('adds the pointer sweep to the starting rotation', () => {
    const rotation = rotateResult({
      startRotation: 10,
      pivot: origin,
      startPointer: { x: 100, y: 0 },
      pointer: { x: 0, y: 100 },
      snap: false,
    })
    expect(rotation).toBeCloseTo(100)
  })

  it('snaps to 15 degree steps when asked', () => {
    const rotation = rotateResult({
      startRotation: 10,
      pivot: origin,
      startPointer: { x: 100, y: 0 },
      pointer: { x: 0, y: 100 },
      snap: true,
    })
    expect(rotation).toBe(105)
  })

  it('wraps past a full turn', () => {
    const rotation = rotateResult({
      startRotation: 350,
      pivot: origin,
      startPointer: { x: 100, y: 0 },
      pointer: { x: 0, y: 100 },
      snap: false,
    })
    expect(rotation).toBeCloseTo(80)
  })
})

describe('scaleResult', () => {
  const start = { ...identityTransform(), scaleX: 1.5, scaleY: 1.5 }

  it('scales uniformly by the pointer distance ratio', () => {
    expect(
      scaleResult({
        startTransform: start,
        pivot: origin,
        startPointer: { x: 100, y: 0 },
        pointer: { x: 200, y: 0 },
        freeAxis: false,
      }),
    ).toEqual({ scaleX: 3, scaleY: 3 })
  })

  it('never goes below the minimum scale', () => {
    const { scaleX, scaleY } = scaleResult({
      startTransform: start,
      pivot: origin,
      startPointer: { x: 100, y: 0 },
      pointer: { x: 0.0001, y: 0 },
      freeAxis: false,
    })
    expect(scaleX).toBe(MIN_SCALE)
    expect(scaleY).toBe(MIN_SCALE)
  })

  it('keeps the starting scale when the handle sits on the pivot', () => {
    expect(
      scaleResult({
        startTransform: start,
        pivot: origin,
        startPointer: origin,
        pointer: { x: 50, y: 50 },
        freeAxis: false,
      }),
    ).toEqual({ scaleX: 1.5, scaleY: 1.5 })
  })

  it('scales each axis on its own when freeAxis is set', () => {
    const result = scaleResult({
      startTransform: start,
      pivot: origin,
      startPointer: { x: 100, y: 50 },
      pointer: { x: 200, y: 50 },
      freeAxis: true,
    })
    expect(result.scaleX).toBeCloseTo(3)
    expect(result.scaleY).toBeCloseTo(1.5)
  })

  it('falls back to uniform scaling on a rotated layer', () => {
    const result = scaleResult({
      startTransform: { ...start, rotation: 30 },
      pivot: origin,
      startPointer: { x: 100, y: 50 },
      pointer: { x: 200, y: 50 },
      freeAxis: true,
    })
    expect(result.scaleX).toBeCloseTo(result.scaleY)
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
