import { describe, expect, it } from 'vitest'
import { createGroup, createLayer, emptyDoc } from './defaults'
import {
  addGroups,
  addLayersToGroup,
  allLayers,
  applyFixResult,
  duplicateLayers,
  findGroup,
  findLayer,
  groupFromLayers,
  mergeLayers,
  moveGroup,
  moveLayer,
  nudgeLayers,
  removeGroup,
  removeLayers,
  renameDoc,
  setDocFill,
  setGlass,
  setLayerOverride,
  setTransform,
  setWatchOS,
  splitLayer,
  ungroup,
  updateGroup,
  updateLayer,
  updateLayers,
  usesIC2Features,
} from './ops'
import type { BBox, Fill, Layer, ViewBox } from './types'

const SVG = '<g><rect width="10" height="10"/></g>'
const DEFS = ''
const VB: ViewBox = [0, 0, 100, 100]
const BBOX: BBox = { x: 0, y: 0, width: 10, height: 10 }

const layer = (name: string, extra: Partial<Layer> = {}): Layer =>
  createLayer({ name, svg: SVG, defs: DEFS, sourceViewBox: VB, bbox: BBOX, ...extra })

describe('findLayer / findGroup / allLayers', () => {
  it('finds a layer by id with its location', () => {
    const l1 = layer('A')
    const l2 = layer('B')
    const g = createGroup('G1', [l1, l2])
    const doc = { ...emptyDoc(), groups: [g] }
    const loc = findLayer(doc, l2.id)
    expect(loc).toEqual({ group: g, layer: l2, groupIndex: 0, layerIndex: 1 })
  })

  it('returns null for an unknown layer id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    expect(findLayer(doc, 'nope')).toBeNull()
  })

  it('finds a group by id with its index', () => {
    const g1 = createGroup('G1')
    const g2 = createGroup('G2')
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    expect(findGroup(doc, g2.id)).toEqual({ group: g2, index: 1 })
  })

  it('returns null for an unknown group id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1')] }
    expect(findGroup(doc, 'nope')).toBeNull()
  })

  it('allLayers flattens top-most first across groups', () => {
    const a = layer('A')
    const b = layer('B')
    const c = layer('C')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [a, b]), createGroup('G2', [c])] }
    expect(allLayers(doc).map((l) => l.name)).toEqual(['A', 'B', 'C'])
  })
})

describe('updateLayer', () => {
  it('applies a partial patch to a layer', () => {
    const l1 = layer('A')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [l1])] }
    const next = updateLayer(doc, l1.id, { name: 'Renamed' })
    expect(next.groups[0]?.layers[0]?.name).toBe('Renamed')
    expect(next).not.toBe(doc)
  })

  it('applies a function patch to a layer', () => {
    const l1 = layer('A', { opacity: 1 })
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [l1])] }
    const next = updateLayer(doc, l1.id, (l) => ({ ...l, opacity: l.opacity * 0.5 }))
    expect(next.groups[0]?.layers[0]?.opacity).toBe(0.5)
  })

  it('returns the same doc reference for an unknown layer id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    const next = updateLayer(doc, 'nope', { name: 'X' })
    expect(next).toBe(doc)
  })
})

describe('updateLayers', () => {
  it('patches multiple layers across groups', () => {
    const a = layer('A')
    const b = layer('B')
    const c = layer('C')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [a, b]), createGroup('G2', [c])] }
    const next = updateLayers(doc, [a.id, c.id], { hidden: true })
    expect(next.groups[0]?.layers[0]?.hidden).toBe(true)
    expect(next.groups[0]?.layers[1]?.hidden).toBe(false)
    expect(next.groups[1]?.layers[0]?.hidden).toBe(true)
  })

  it('returns the same doc reference when no ids match', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    const next = updateLayers(doc, ['nope', 'also-nope'], { hidden: true })
    expect(next).toBe(doc)
  })
})

describe('updateGroup', () => {
  it('applies a partial patch to a group', () => {
    const g = createGroup('G1')
    const doc = { ...emptyDoc(), groups: [g] }
    const next = updateGroup(doc, g.id, { name: 'Renamed' })
    expect(next.groups[0]?.name).toBe('Renamed')
  })

  it('applies a function patch to a group', () => {
    const g = createGroup('G1')
    const doc = { ...emptyDoc(), groups: [g] }
    const next = updateGroup(doc, g.id, (grp) => ({ ...grp, opacity: 0.5 }))
    expect(next.groups[0]?.opacity).toBe(0.5)
  })

  it('returns the same doc reference for an unknown group id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1')] }
    const next = updateGroup(doc, 'nope', { name: 'X' })
    expect(next).toBe(doc)
  })
})

describe('setGlass', () => {
  it('merges a partial patch into group.glass', () => {
    const g = createGroup('G1')
    const doc = { ...emptyDoc(), groups: [g] }
    const next = setGlass(doc, g.id, { blurMaterial: 0.9 })
    expect(next.groups[0]?.glass.blurMaterial).toBe(0.9)
    expect(next.groups[0]?.glass.lighting).toBe('individual')
  })

  it('returns the same doc reference for an unknown group id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1')] }
    expect(setGlass(doc, 'nope', { blurMaterial: 0.9 })).toBe(doc)
  })
})

describe('setLayerOverride', () => {
  it('creates and merges an override', () => {
    const l1 = layer('A')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [l1])] }
    const withOpacity = setLayerOverride(doc, l1.id, 'dark', { opacity: 0.5 })
    expect(withOpacity.groups[0]?.layers[0]?.overrides.dark).toEqual({ opacity: 0.5 })
    const withHidden = setLayerOverride(withOpacity, l1.id, 'dark', { hidden: true })
    expect(withHidden.groups[0]?.layers[0]?.overrides.dark).toEqual({ opacity: 0.5, hidden: true })
  })

  it('removes a key when the patch sets it to undefined', () => {
    const l1 = layer('A')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [l1])] }
    const withOpacity = setLayerOverride(doc, l1.id, 'mono', { opacity: 0.5, hidden: true })
    const removed = setLayerOverride(withOpacity, l1.id, 'mono', { hidden: undefined })
    expect(removed.groups[0]?.layers[0]?.overrides.mono).toEqual({ opacity: 0.5 })
  })

  it('clears the override entirely when patch is null', () => {
    const l1 = layer('A')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [l1])] }
    const withOverride = setLayerOverride(doc, l1.id, 'dark', { opacity: 0.5 })
    const cleared = setLayerOverride(withOverride, l1.id, 'dark', null)
    expect(cleared.groups[0]?.layers[0]?.overrides.dark).toBeUndefined()
  })

  it('returns the same doc reference for an unknown layer id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    expect(setLayerOverride(doc, 'nope', 'dark', { opacity: 0.5 })).toBe(doc)
    expect(setLayerOverride(doc, 'nope', 'dark', null)).toBe(doc)
  })
})

describe('setTransform', () => {
  it('merges a partial transform patch', () => {
    const l1 = layer('A')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [l1])] }
    const next = setTransform(doc, l1.id, { x: 10, rotation: 45 })
    const t = next.groups[0]?.layers[0]?.transform
    expect(t).toEqual({ x: 10, y: 0, scaleX: 1, scaleY: 1, rotation: 45 })
  })

  it('returns the same doc reference for an unknown layer id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    expect(setTransform(doc, 'nope', { x: 10 })).toBe(doc)
  })
})

describe('nudgeLayers', () => {
  it('adds dx/dy to transform.x/y for the given layers', () => {
    const a = layer('A')
    const b = layer('B')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [a, b])] }
    const next = nudgeLayers(doc, [a.id], 1, -10)
    expect(next.groups[0]?.layers[0]?.transform).toMatchObject({ x: 1, y: -10 })
    expect(next.groups[0]?.layers[1]?.transform).toMatchObject({ x: 0, y: 0 })
  })

  it('returns the same doc reference when no ids match', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    expect(nudgeLayers(doc, ['nope'], 1, 1)).toBe(doc)
  })
})

describe('addGroups', () => {
  it('inserts groups at the given index (default 0 = top-most)', () => {
    const g1 = createGroup('G1')
    const doc = { ...emptyDoc(), groups: [g1] }
    const newGroup = createGroup('New')
    const next = addGroups(doc, [newGroup])
    expect(next.groups.map((g) => g.name)).toEqual(['New', 'G1'])
  })

  it('inserts at a specific index', () => {
    const g1 = createGroup('G1')
    const g2 = createGroup('G2')
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const newGroup = createGroup('New')
    const next = addGroups(doc, [newGroup], 1)
    expect(next.groups.map((g) => g.name)).toEqual(['G1', 'New', 'G2'])
  })

  it('returns the same doc reference for an empty groups array', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1')] }
    expect(addGroups(doc, [])).toBe(doc)
  })
})

describe('addLayersToGroup', () => {
  it('inserts layers into a group at an index', () => {
    const a = layer('A')
    const g = createGroup('G1', [a])
    const doc = { ...emptyDoc(), groups: [g] }
    const newLayer = layer('New')
    const next = addLayersToGroup(doc, g.id, [newLayer], 0)
    expect(next.groups[0]?.layers.map((l) => l.name)).toEqual(['New', 'A'])
  })

  it('returns the same doc reference for an unknown group id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1')] }
    expect(addLayersToGroup(doc, 'nope', [layer('New')])).toBe(doc)
  })

  it('returns the same doc reference for an empty layers array', () => {
    const g = createGroup('G1')
    const doc = { ...emptyDoc(), groups: [g] }
    expect(addLayersToGroup(doc, g.id, [])).toBe(doc)
  })
})

describe('removeLayers', () => {
  it('removes layers but keeps groups left empty', () => {
    const a = layer('A')
    const g = createGroup('G1', [a])
    const doc = { ...emptyDoc(), groups: [g] }
    const next = removeLayers(doc, [a.id])
    expect(next.groups).toHaveLength(1)
    expect(next.groups[0]?.layers).toHaveLength(0)
  })

  it('returns the same doc reference when no ids match', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    expect(removeLayers(doc, ['nope'])).toBe(doc)
  })
})

describe('removeGroup', () => {
  it('removes the group and its layers when keepLayers is false', () => {
    const g1 = createGroup('G1', [layer('A')])
    const g2 = createGroup('G2', [layer('B')])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const next = removeGroup(doc, g1.id, false)
    expect(next.groups.map((g) => g.id)).toEqual([g2.id])
  })

  it('removes the last group entirely when keepLayers is false, even if it is the only group', () => {
    const g1 = createGroup('G1', [layer('A')])
    const doc = { ...emptyDoc(), groups: [g1] }
    const next = removeGroup(doc, g1.id, false)
    expect(next.groups).toHaveLength(0)
  })

  it('moves layers to the top of the group below when keepLayers is true', () => {
    const a = layer('A')
    const b = layer('B')
    const g1 = createGroup('G1', [a])
    const g2 = createGroup('G2', [b])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const next = removeGroup(doc, g1.id, true)
    expect(next.groups).toHaveLength(1)
    expect(next.groups[0]?.id).toBe(g2.id)
    expect(next.groups[0]?.layers.map((l) => l.name)).toEqual(['A', 'B'])
  })

  it('moves layers to the bottom of the group above when there is no group below', () => {
    const a = layer('A')
    const b = layer('B')
    const g1 = createGroup('G1', [a])
    const g2 = createGroup('G2', [b])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const next = removeGroup(doc, g2.id, true)
    expect(next.groups).toHaveLength(1)
    expect(next.groups[0]?.id).toBe(g1.id)
    expect(next.groups[0]?.layers.map((l) => l.name)).toEqual(['A', 'B'])
  })

  it('is a no-op when it is the only group and keepLayers is true', () => {
    const g1 = createGroup('G1', [layer('A')])
    const doc = { ...emptyDoc(), groups: [g1] }
    const next = removeGroup(doc, g1.id, true)
    expect(next).toBe(doc)
  })

  it('returns the same doc reference for an unknown group id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1')] }
    expect(removeGroup(doc, 'nope', true)).toBe(doc)
  })
})

describe('ungroup', () => {
  it('is equivalent to removeGroup(doc, groupId, true)', () => {
    const a = layer('A')
    const b = layer('B')
    const g1 = createGroup('G1', [a])
    const g2 = createGroup('G2', [b])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    expect(ungroup(doc, g1.id)).toEqual(removeGroup(doc, g1.id, true))
  })
})

describe('moveLayer', () => {
  it('reorders a layer within the same group', () => {
    const a = layer('A')
    const b = layer('B')
    const c = layer('C')
    const g = createGroup('G1', [a, b, c])
    const doc = { ...emptyDoc(), groups: [g] }
    const next = moveLayer(doc, a.id, g.id, 2)
    expect(next.groups[0]?.layers.map((l) => l.name)).toEqual(['B', 'C', 'A'])
  })

  it('moves a layer across groups at the destination index', () => {
    const a = layer('A')
    const b = layer('B')
    const g1 = createGroup('G1', [a])
    const g2 = createGroup('G2', [b])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const next = moveLayer(doc, a.id, g2.id, 1)
    expect(next.groups[0]?.layers).toHaveLength(0)
    expect(next.groups[1]?.layers.map((l) => l.name)).toEqual(['B', 'A'])
  })

  it('returns the same doc reference for an unknown layer id', () => {
    const g = createGroup('G1', [layer('A')])
    const doc = { ...emptyDoc(), groups: [g] }
    expect(moveLayer(doc, 'nope', g.id, 0)).toBe(doc)
  })

  it('returns the same doc reference for an unknown destination group id', () => {
    const a = layer('A')
    const g = createGroup('G1', [a])
    const doc = { ...emptyDoc(), groups: [g] }
    expect(moveLayer(doc, a.id, 'nope', 0)).toBe(doc)
  })
})

describe('moveGroup', () => {
  it('reorders groups', () => {
    const g1 = createGroup('G1')
    const g2 = createGroup('G2')
    const g3 = createGroup('G3')
    const doc = { ...emptyDoc(), groups: [g1, g2, g3] }
    const next = moveGroup(doc, g1.id, 2)
    expect(next.groups.map((g) => g.name)).toEqual(['G2', 'G3', 'G1'])
  })

  it('returns the same doc reference for an unknown group id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1')] }
    expect(moveGroup(doc, 'nope', 0)).toBe(doc)
  })
})

describe('duplicateLayers', () => {
  it('duplicates layers directly above their originals with new ids and suffixed names', () => {
    const a = layer('A')
    const b = layer('B')
    const g = createGroup('G1', [a, b])
    const doc = { ...emptyDoc(), groups: [g] }
    const { doc: next, newIds } = duplicateLayers(doc, [a.id])
    expect(newIds).toHaveLength(1)
    expect(next.groups[0]?.layers.map((l) => l.name)).toEqual(['A copy', 'A', 'B'])
    expect(next.groups[0]?.layers[0]?.id).toBe(newIds[0])
    expect(next.groups[0]?.layers[0]?.id).not.toBe(a.id)
  })

  it('duplicates multiple layers across groups', () => {
    const a = layer('A')
    const b = layer('B')
    const g1 = createGroup('G1', [a])
    const g2 = createGroup('G2', [b])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const { doc: next, newIds } = duplicateLayers(doc, [a.id, b.id])
    expect(newIds).toHaveLength(2)
    expect(next.groups[0]?.layers.map((l) => l.name)).toEqual(['A copy', 'A'])
    expect(next.groups[1]?.layers.map((l) => l.name)).toEqual(['B copy', 'B'])
  })

  it('returns the same doc reference and empty newIds when no ids match', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    const { doc: next, newIds } = duplicateLayers(doc, ['nope'])
    expect(next).toBe(doc)
    expect(newIds).toEqual([])
  })
})

describe('groupFromLayers', () => {
  it('collects selected layers preserving relative order into a new group', () => {
    const a = layer('A')
    const b = layer('B')
    const c = layer('C')
    const d = layer('D')
    const g1 = createGroup('G1', [a, b])
    const g2 = createGroup('G2', [c, d])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const { doc: next, groupId } = groupFromLayers(doc, [d.id, a.id], 'Selected')
    expect(next.groups.map((g) => g.name)).toEqual(['Selected', 'G1', 'G2'])
    const newGroup = next.groups.find((g) => g.id === groupId)
    expect(newGroup?.layers.map((l) => l.name)).toEqual(['A', 'D'])
    expect(next.groups[1]?.layers.map((l) => l.name)).toEqual(['B'])
    expect(next.groups[2]?.layers.map((l) => l.name)).toEqual(['C'])
  })

  it('inserts the new group at the index of the group holding the top-most selected layer', () => {
    const a = layer('A')
    const b = layer('B')
    const g1 = createGroup('G1', [a])
    const g2 = createGroup('G2', [b])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const { doc: next, groupId } = groupFromLayers(doc, [b.id])
    expect(next.groups.map((g) => g.id)).toEqual([g1.id, groupId, g2.id])
  })

  it('defaults the name to Group N', () => {
    const a = layer('A')
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [a])] }
    const { doc: next, groupId } = groupFromLayers(doc, [a.id])
    const newGroup = next.groups.find((g) => g.id === groupId)
    expect(newGroup?.name).toMatch(/^Group \d+$/)
  })

  it('returns the input doc unchanged when no ids match', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    const { doc: next } = groupFromLayers(doc, ['nope'])
    expect(next).toBe(doc)
  })

  it('preserves the object identity of groups with no selected layer', () => {
    const a = layer('A')
    const g1 = createGroup('G1', [a])
    const untouched = createGroup('G2', [layer('B')])
    const doc = { ...emptyDoc(), groups: [g1, untouched] }
    const { doc: next } = groupFromLayers(doc, [a.id])
    const stillThere = next.groups.find((g) => g.id === untouched.id)
    expect(stillThere).toBe(untouched)
  })
})

describe('mergeLayers', () => {
  it('merges layers from one group into a single layer at the top-most selected index', () => {
    const a = layer('A')
    const b = layer('B')
    const c = layer('C')
    const g = createGroup('G1', [a, b, c])
    const doc = { ...emptyDoc(), groups: [g] }
    const merged = layer('Merged')
    const next = mergeLayers(doc, [b.id, c.id], (layers) => {
      expect(layers.map((l) => l.name)).toEqual(['B', 'C'])
      return merged
    })
    expect(next.groups[0]?.layers.map((l) => l.name)).toEqual(['A', 'Merged'])
  })

  it('returns the input doc unchanged when ids span multiple groups', () => {
    const a = layer('A')
    const b = layer('B')
    const g1 = createGroup('G1', [a])
    const g2 = createGroup('G2', [b])
    const doc = { ...emptyDoc(), groups: [g1, g2] }
    const next = mergeLayers(doc, [a.id, b.id], (layers) => layers[0] as Layer)
    expect(next).toBe(doc)
  })

  it('returns the input doc unchanged for unknown ids', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    const next = mergeLayers(doc, ['nope'], (layers) => layers[0] as Layer)
    expect(next).toBe(doc)
  })
})

describe('splitLayer', () => {
  it('replaces a layer in place with the split results', () => {
    const a = layer('A')
    const b = layer('B')
    const g = createGroup('G1', [a, b])
    const doc = { ...emptyDoc(), groups: [g] }
    const a1 = layer('A1')
    const a2 = layer('A2')
    const next = splitLayer(doc, a.id, (l) => {
      expect(l.id).toBe(a.id)
      return [a1, a2]
    })
    expect(next.groups[0]?.layers.map((l) => l.name)).toEqual(['A1', 'A2', 'B'])
  })

  it('returns the input doc unchanged for an unknown layer id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    const next = splitLayer(doc, 'nope', (l) => [l])
    expect(next).toBe(doc)
  })
})

describe('applyFixResult', () => {
  it('replaces the layer in place when fixed is a layer', () => {
    const a = layer('A')
    const g = createGroup('G1', [a])
    const doc = { ...emptyDoc(), groups: [g] }
    const fixed = { ...a, name: 'Fixed' }
    const next = applyFixResult(doc, a.id, fixed)
    expect(next.groups[0]?.layers[0]?.name).toBe('Fixed')
  })

  it('deletes the layer when fixed is null', () => {
    const a = layer('A')
    const g = createGroup('G1', [a])
    const doc = { ...emptyDoc(), groups: [g] }
    const next = applyFixResult(doc, a.id, null)
    expect(next.groups[0]?.layers).toHaveLength(0)
  })

  it('returns the input doc unchanged for an unknown layer id', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1', [layer('A')])] }
    expect(applyFixResult(doc, 'nope', null)).toBe(doc)
  })
})

describe('setDocFill', () => {
  const solid = (v: number): Fill => ({
    kind: 'solid',
    color: { space: 'srgb', components: [v, v, v, 1] },
  })

  it('sets the default fill', () => {
    const doc = emptyDoc()
    const next = setDocFill(doc, 'default', solid(0.2))
    expect(next.fill.default).toEqual(solid(0.2))
  })

  it('sets the dark fill', () => {
    const doc = emptyDoc()
    const next = setDocFill(doc, 'dark', solid(0.1))
    expect(next.fill.dark).toEqual(solid(0.1))
  })

  it('removes the dark fill when undefined', () => {
    const doc = setDocFill(emptyDoc(), 'dark', solid(0.1))
    const next = setDocFill(doc, 'dark', undefined)
    expect(next.fill.dark).toBeUndefined()
  })

  it('leaves the default fill unchanged when passed undefined (required field)', () => {
    const doc = emptyDoc()
    const next = setDocFill(doc, 'default', undefined)
    expect(next.fill.default).toEqual(doc.fill.default)
  })
})

describe('renameDoc', () => {
  it('renames the document', () => {
    const doc = emptyDoc('Old')
    const next = renameDoc(doc, 'New')
    expect(next.name).toBe('New')
  })
})

describe('setWatchOS', () => {
  it('toggles watchOS', () => {
    const doc = emptyDoc()
    expect(setWatchOS(doc, true).watchOS).toBe(true)
    expect(setWatchOS(doc, false).watchOS).toBe(false)
  })
})

describe('usesIC2Features', () => {
  it('is false for a document with only default glass settings', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G1')] }
    expect(usesIC2Features(doc)).toBe(false)
  })

  it('is true when a group has specularPlacement defined', () => {
    const g = createGroup('G1')
    g.glass.specularPlacement = 'inside'
    const doc = { ...emptyDoc(), groups: [g] }
    expect(usesIC2Features(doc)).toBe(true)
  })

  it('is true when a group has refractivity defined', () => {
    const g = createGroup('G1')
    g.glass.refractivity = { enabled: true, strength: 0.5, depth: 0.5 }
    const doc = { ...emptyDoc(), groups: [g] }
    expect(usesIC2Features(doc)).toBe(true)
  })
})
