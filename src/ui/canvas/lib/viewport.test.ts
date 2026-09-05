import { describe, expect, it } from 'vitest'
import {
  FIT_PADDING,
  fitSize,
  MAX_ZOOM,
  MIN_ZOOM,
  nextZoom,
  stageSize,
  toCanvasPoint,
} from './viewport'

describe('fitSize', () => {
  it('is the shorter side less the padding', () => {
    expect(fitSize(800, 600)).toBe(600 - FIT_PADDING)
    expect(fitSize(400, 900)).toBe(400 - FIT_PADDING)
  })

  it('never goes below one pixel', () => {
    expect(fitSize(10, 10)).toBe(1)
    expect(fitSize(0, 0)).toBe(1)
  })
})

describe('stageSize', () => {
  it('fits the view at zoom 0', () => {
    expect(stageSize(800, 600, 0)).toBe(fitSize(800, 600))
  })

  it('multiplies the fitted size at other zooms', () => {
    expect(stageSize(800, 600, 2)).toBe(fitSize(800, 600) * 2)
  })
})

describe('nextZoom', () => {
  it('steps out from the fitted size in 0.1 increments', () => {
    expect(nextZoom(0, -100)).toBe(1.1)
    expect(nextZoom(0, 100)).toBe(0.9)
  })

  it('clamps to the zoom range', () => {
    expect(nextZoom(MAX_ZOOM, -100)).toBe(MAX_ZOOM)
    expect(nextZoom(MIN_ZOOM, 100)).toBe(MIN_ZOOM)
  })

  it('keeps two decimal places', () => {
    expect(nextZoom(1.25, -1)).toBe(1.35)
  })
})

describe('toCanvasPoint', () => {
  const rect = { left: 100, top: 50 }

  it('maps client coordinates into canvas points', () => {
    expect(toCanvasPoint({ x: 100, y: 50 }, rect, 512)).toEqual({ x: 0, y: 0 })
    expect(toCanvasPoint({ x: 612, y: 562 }, rect, 512)).toEqual({ x: 1024, y: 1024 })
    expect(toCanvasPoint({ x: 356, y: 306 }, rect, 512)).toEqual({ x: 512, y: 512 })
  })

  it('falls back to the origin for a zero-sized stage', () => {
    expect(toCanvasPoint({ x: 10, y: 10 }, rect, 0)).toEqual({ x: 0, y: 0 })
  })
})
