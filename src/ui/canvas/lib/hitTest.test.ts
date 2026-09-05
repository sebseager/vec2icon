import { describe, expect, it } from 'vitest'
import { createGroup, createLayer } from '@/core/model/defaults'
import type { BBox, IconDoc, Layer } from '@/core/model/types'
import { hitTest } from './hitTest'

/** A layer whose source viewBox is the 1024 canvas, so source units == canvas points. */
const layerAt = (name: string, bbox: BBox, patch: Partial<Layer> = {}): Layer =>
  createLayer({
    name,
    svg: '<g/>',
    defs: '',
    sourceViewBox: [0, 0, 1024, 1024],
    bbox,
    ...patch,
  })

const docOf = (...groups: IconDoc['groups']): IconDoc => ({
  name: 'Icon',
  fill: { default: { kind: 'none' } },
  watchOS: false,
  groups,
})

describe('hitTest', () => {
  it('returns null when nothing is under the point', () => {
    const doc = docOf(createGroup('g', [layerAt('a', { x: 0, y: 0, width: 100, height: 100 })]))
    expect(hitTest(doc, { x: 500, y: 500 })).toBeNull()
  })

  it('returns the layer whose canvas bbox contains the point', () => {
    const a = layerAt('a', { x: 0, y: 0, width: 100, height: 100 })
    const doc = docOf(createGroup('g', [a]))
    expect(hitTest(doc, { x: 50, y: 50 })?.id).toBe(a.id)
  })

  it('prefers the top-most layer within a group', () => {
    const top = layerAt('top', { x: 0, y: 0, width: 200, height: 200 })
    const bottom = layerAt('bottom', { x: 0, y: 0, width: 200, height: 200 })
    const doc = docOf(createGroup('g', [top, bottom]))
    expect(hitTest(doc, { x: 10, y: 10 })?.id).toBe(top.id)
  })

  it('prefers the top-most group', () => {
    const top = layerAt('top', { x: 0, y: 0, width: 200, height: 200 })
    const bottom = layerAt('bottom', { x: 0, y: 0, width: 200, height: 200 })
    const doc = docOf(createGroup('top', [top]), createGroup('bottom', [bottom]))
    expect(hitTest(doc, { x: 10, y: 10 })?.id).toBe(top.id)
  })

  it('skips hidden layers', () => {
    const top = layerAt('top', { x: 0, y: 0, width: 200, height: 200 }, { hidden: true })
    const bottom = layerAt('bottom', { x: 0, y: 0, width: 200, height: 200 })
    const doc = docOf(createGroup('g', [top, bottom]))
    expect(hitTest(doc, { x: 10, y: 10 })?.id).toBe(bottom.id)
  })

  it('skips hidden groups', () => {
    const hiddenGroup = {
      ...createGroup('h', [layerAt('a', { x: 0, y: 0, width: 200, height: 200 })]),
      hidden: true,
    }
    const visible = layerAt('b', { x: 0, y: 0, width: 200, height: 200 })
    const doc = docOf(hiddenGroup, createGroup('v', [visible]))
    expect(hitTest(doc, { x: 10, y: 10 })?.id).toBe(visible.id)
  })

  it('accounts for the layer transform', () => {
    const moved = layerAt(
      'moved',
      { x: 0, y: 0, width: 100, height: 100 },
      { transform: { x: 400, y: 400, scaleX: 1, scaleY: 1, rotation: 0 } },
    )
    const doc = docOf(createGroup('g', [moved]))
    expect(hitTest(doc, { x: 50, y: 50 })).toBeNull()
    expect(hitTest(doc, { x: 450, y: 450 })?.id).toBe(moved.id)
  })
})
