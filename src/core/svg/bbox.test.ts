import { afterEach, describe, expect, it } from 'vitest'
import type { ViewBox } from '../model/types'
import { domMeasurer, type Measurer, measureBBox, pureMeasurer, setDefaultMeasurer } from './bbox'

const VB: ViewBox = [0, 0, 100, 100]
const measure = (svg: string, viewBox: ViewBox = VB) => pureMeasurer(svg, '', viewBox)
const round = (n: number) => Math.round(n * 1000) / 1000

afterEach(() => {
  setDefaultMeasurer(null)
})

describe('pureMeasurer', () => {
  it('measures a rect', () => {
    expect(measure('<g><rect x="10" y="20" width="30" height="40"/></g>')).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })
  })

  it('measures a circle and an ellipse', () => {
    expect(measure('<g><circle cx="50" cy="50" r="10"/></g>')).toEqual({
      x: 40,
      y: 40,
      width: 20,
      height: 20,
    })
    expect(measure('<g><ellipse cx="50" cy="50" rx="10" ry="5"/></g>')).toEqual({
      x: 40,
      y: 45,
      width: 20,
      height: 10,
    })
  })

  it('measures lines, polylines and polygons', () => {
    expect(measure('<g><line x1="1" y1="2" x2="9" y2="4"/></g>')).toEqual({
      x: 1,
      y: 2,
      width: 8,
      height: 2,
    })
    expect(measure('<g><polygon points="0,0 10,0 5,8"/></g>')).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 8,
    })
  })

  it('measures an image by its box and ignores text and use', () => {
    expect(
      measure('<g><image x="4" y="4" width="8" height="8"/><text x="0" y="0">hi</text></g>'),
    ).toEqual({ x: 4, y: 4, width: 8, height: 8 })
    expect(measure('<g><use href="#a"/></g>')).toBeNull()
  })

  it('measures a path with straight segments, absolute and relative', () => {
    expect(measure('<g><path d="M10 10 H 30 V 40 L 20 40 Z"/></g>')).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 30,
    })
    expect(measure('<g><path d="m 5 5 l 10 0 l 0 10 z"/></g>')).toEqual({
      x: 5,
      y: 5,
      width: 10,
      height: 10,
    })
  })

  it('bounds curves conservatively by their control points', () => {
    expect(measure('<g><path d="M0 0 C 0 50 100 50 100 0"/></g>')).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    })
    expect(measure('<g><path d="M0 0 Q 50 80 100 0"/></g>')).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    })
  })

  it('includes arc end points', () => {
    expect(measure('<g><path d="M10 10 A 5 5 0 0 1 30 10"/></g>')).toEqual({
      x: 10,
      y: 10,
      width: 20,
      height: 0,
    })
  })

  it('applies the element transform', () => {
    expect(
      measure('<g><rect width="5" height="5" transform="translate(10,20) scale(2)"/></g>'),
    ).toEqual({ x: 10, y: 20, width: 10, height: 10 })
  })

  it('applies ancestor transforms through nested groups', () => {
    const box = measure(
      '<g transform="translate(100,0)"><g transform="scale(2)"><rect x="1" y="1" width="2" height="2"/></g></g>',
    )
    expect(box).toEqual({ x: 102, y: 2, width: 4, height: 4 })
  })

  it('applies rotate with an optional centre', () => {
    const box = measure('<g><rect width="10" height="10" transform="rotate(90)"/></g>')
    expect(
      box && {
        x: round(box.x),
        y: round(box.y),
        width: round(box.width),
        height: round(box.height),
      },
    ).toEqual({ x: -10, y: 0, width: 10, height: 10 })
    const around = measure('<g><rect width="10" height="10" transform="rotate(90 5 5)"/></g>')
    expect(
      around && {
        x: round(around.x),
        y: round(around.y),
        width: round(around.width),
        height: round(around.height),
      },
    ).toEqual({ x: 0, y: 0, width: 10, height: 10 })
  })

  it('unions every shape in the fragment', () => {
    expect(
      measure('<g><rect x="0" y="0" width="10" height="10"/><circle cx="50" cy="50" r="5"/></g>'),
    ).toEqual({
      x: 0,
      y: 0,
      width: 55,
      height: 55,
    })
  })

  it('returns null when there is nothing measurable', () => {
    expect(measure('<g></g>')).toBeNull()
    expect(measure('<g><text x="0" y="0">only text</text></g>')).toBeNull()
    expect(pureMeasurer('<g><rect', '', VB)).toBeNull()
  })
})

describe('domMeasurer', () => {
  it('returns null under happy-dom, where getBBox reports nothing', () => {
    expect(domMeasurer('<g><rect width="10" height="10"/></g>', '', VB)).toBeNull()
  })
})

describe('measureBBox', () => {
  it('uses the supplied measurer when given one', () => {
    const stub: Measurer = () => ({ x: 1, y: 2, width: 3, height: 4 })
    expect(measureBBox('<g/>', '', VB, stub)).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })

  it('falls back to the viewBox when the measurer yields nothing', () => {
    expect(measureBBox('<g/>', '', [5, 6, 70, 80], () => null)).toEqual({
      x: 5,
      y: 6,
      width: 70,
      height: 80,
    })
  })

  it('falls through the dom measurer to the pure measurer by default', () => {
    expect(measureBBox('<g><rect x="2" y="3" width="4" height="5"/></g>', '', VB)).toEqual({
      x: 2,
      y: 3,
      width: 4,
      height: 5,
    })
  })

  it('falls back to the viewBox when nothing is measurable', () => {
    expect(measureBBox('<g><text>hi</text></g>', '', VB)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })
  })

  it('honours an injected default measurer', () => {
    setDefaultMeasurer(() => ({ x: 9, y: 9, width: 1, height: 1 }))
    expect(measureBBox('<g><rect width="10" height="10"/></g>', '', VB)).toEqual({
      x: 9,
      y: 9,
      width: 1,
      height: 1,
    })
    setDefaultMeasurer(null)
    expect(measureBBox('<g><rect width="10" height="10"/></g>', '', VB)).toEqual({
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    })
  })
})
