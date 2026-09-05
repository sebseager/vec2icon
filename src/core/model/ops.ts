/** Pure, immutable document operations. Every op returns a new `IconDoc`; when the
 * ids it is given are unknown, it returns the *same* doc reference unchanged. */
import { createGroup, newId } from './defaults'
import type { Fill, Glass, Group, IconDoc, Layer, LayerOverride, Transform } from './types'

export type LayerLocation = { group: Group; layer: Layer; groupIndex: number; layerIndex: number }

type Patch<T> = Partial<T> | ((item: T) => T)

const applyPatch = <T>(item: T, patch: Patch<T>): T =>
  typeof patch === 'function' ? (patch as (item: T) => T)(item) : { ...item, ...patch }

export const findGroup = (
  doc: IconDoc,
  groupId: string,
): { group: Group; index: number } | null => {
  const index = doc.groups.findIndex((g) => g.id === groupId)
  return index === -1 ? null : { group: doc.groups[index] as Group, index }
}

export const findLayer = (doc: IconDoc, layerId: string): LayerLocation | null => {
  for (let groupIndex = 0; groupIndex < doc.groups.length; groupIndex++) {
    const group = doc.groups[groupIndex] as Group
    const layerIndex = group.layers.findIndex((l) => l.id === layerId)
    if (layerIndex !== -1) {
      return { group, layer: group.layers[layerIndex] as Layer, groupIndex, layerIndex }
    }
  }
  return null
}

export const allLayers = (doc: IconDoc): Layer[] => doc.groups.flatMap((g) => g.layers)

export const updateLayers = (doc: IconDoc, layerIds: string[], patch: Patch<Layer>): IconDoc => {
  const ids = new Set(layerIds)
  let changed = false
  const groups = doc.groups.map((group) => {
    let groupChanged = false
    const layers = group.layers.map((layer) => {
      if (!ids.has(layer.id)) return layer
      groupChanged = true
      return applyPatch(layer, patch)
    })
    if (!groupChanged) return group
    changed = true
    return { ...group, layers }
  })
  return changed ? { ...doc, groups } : doc
}

export const updateLayer = (doc: IconDoc, layerId: string, patch: Patch<Layer>): IconDoc =>
  updateLayers(doc, [layerId], patch)

export const updateGroup = (doc: IconDoc, groupId: string, patch: Patch<Group>): IconDoc => {
  const found = findGroup(doc, groupId)
  if (!found) return doc
  const groups = [...doc.groups]
  groups[found.index] = applyPatch(found.group, patch)
  return { ...doc, groups }
}

export const setGlass = (doc: IconDoc, groupId: string, patch: Partial<Glass>): IconDoc =>
  updateGroup(doc, groupId, (g) => ({ ...g, glass: { ...g.glass, ...patch } }))

const mergeOverride = (current: LayerOverride, patch: Partial<LayerOverride>): LayerOverride => {
  const merged: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key]
    else merged[key] = value
  }
  return merged as LayerOverride
}

export const setLayerOverride = (
  doc: IconDoc,
  layerId: string,
  appearance: 'dark' | 'mono',
  patch: Partial<LayerOverride> | null,
): IconDoc =>
  updateLayer(doc, layerId, (layer) => {
    if (patch === null) {
      if (!layer.overrides[appearance]) return layer
      const overrides = { ...layer.overrides }
      delete overrides[appearance]
      return { ...layer, overrides }
    }
    const current = layer.overrides[appearance] ?? {}
    return {
      ...layer,
      overrides: { ...layer.overrides, [appearance]: mergeOverride(current, patch) },
    }
  })

export const setTransform = (doc: IconDoc, layerId: string, patch: Partial<Transform>): IconDoc =>
  updateLayer(doc, layerId, (layer) => ({ ...layer, transform: { ...layer.transform, ...patch } }))

export const nudgeLayers = (doc: IconDoc, layerIds: string[], dx: number, dy: number): IconDoc =>
  updateLayers(doc, layerIds, (layer) => ({
    ...layer,
    transform: { ...layer.transform, x: layer.transform.x + dx, y: layer.transform.y + dy },
  }))

export const addGroups = (doc: IconDoc, groups: Group[], index = 0): IconDoc => {
  if (groups.length === 0) return doc
  const next = [...doc.groups]
  next.splice(index, 0, ...groups)
  return { ...doc, groups: next }
}

export const addLayersToGroup = (
  doc: IconDoc,
  groupId: string,
  layers: Layer[],
  index = 0,
): IconDoc => {
  if (layers.length === 0) return doc
  const found = findGroup(doc, groupId)
  if (!found) return doc
  const nextLayers = [...found.group.layers]
  nextLayers.splice(index, 0, ...layers)
  const groups = [...doc.groups]
  groups[found.index] = { ...found.group, layers: nextLayers }
  return { ...doc, groups }
}

export const removeLayers = (doc: IconDoc, layerIds: string[]): IconDoc => {
  const ids = new Set(layerIds)
  let changed = false
  const groups = doc.groups.map((group) => {
    const layers = group.layers.filter((l) => !ids.has(l.id))
    if (layers.length === group.layers.length) return group
    changed = true
    return { ...group, layers }
  })
  return changed ? { ...doc, groups } : doc
}

export const removeGroup = (doc: IconDoc, groupId: string, keepLayers: boolean): IconDoc => {
  const found = findGroup(doc, groupId)
  if (!found) return doc
  const { group, index } = found

  if (!keepLayers) {
    return { ...doc, groups: doc.groups.filter((g) => g.id !== groupId) }
  }

  if (doc.groups.length === 1) return doc

  const groups = doc.groups.filter((g) => g.id !== groupId)
  const hasBelow = index < doc.groups.length - 1
  if (hasBelow) {
    const target = groups[index] as Group
    groups[index] = { ...target, layers: [...group.layers, ...target.layers] }
  } else {
    const target = groups[index - 1] as Group
    groups[index - 1] = { ...target, layers: [...target.layers, ...group.layers] }
  }
  return { ...doc, groups }
}

export const moveLayer = (
  doc: IconDoc,
  layerId: string,
  toGroupId: string,
  toIndex: number,
): IconDoc => {
  const loc = findLayer(doc, layerId)
  if (!loc) return doc
  if (!findGroup(doc, toGroupId)) return doc

  const withoutLayer = doc.groups.map((g) =>
    g.id === loc.group.id ? { ...g, layers: g.layers.filter((l) => l.id !== layerId) } : g,
  )
  const groups = withoutLayer.map((g) => {
    if (g.id !== toGroupId) return g
    const layers = [...g.layers]
    const index = Math.max(0, Math.min(toIndex, layers.length))
    layers.splice(index, 0, loc.layer)
    return { ...g, layers }
  })
  return { ...doc, groups }
}

export const moveGroup = (doc: IconDoc, groupId: string, toIndex: number): IconDoc => {
  const index = doc.groups.findIndex((g) => g.id === groupId)
  if (index === -1) return doc
  const groups = [...doc.groups]
  const [group] = groups.splice(index, 1) as [Group]
  const clamped = Math.max(0, Math.min(toIndex, groups.length))
  groups.splice(clamped, 0, group)
  return { ...doc, groups }
}

export const duplicateLayers = (
  doc: IconDoc,
  layerIds: string[],
): { doc: IconDoc; newIds: string[] } => {
  const ids = new Set(layerIds)
  const newIds: string[] = []
  let changed = false
  const groups = doc.groups.map((group) => {
    let groupChanged = false
    const layers: Layer[] = []
    for (const layer of group.layers) {
      if (ids.has(layer.id)) {
        const copy: Layer = { ...layer, id: newId(), name: `${layer.name} copy` }
        layers.push(copy, layer)
        newIds.push(copy.id)
        groupChanged = true
      } else {
        layers.push(layer)
      }
    }
    if (!groupChanged) return group
    changed = true
    return { ...group, layers }
  })
  return { doc: changed ? { ...doc, groups } : doc, newIds }
}

const nextGroupName = (doc: IconDoc): string => {
  const nums = doc.groups
    .map((g) => /^Group (\d+)$/.exec(g.name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `Group ${max + 1}`
}

export const groupFromLayers = (
  doc: IconDoc,
  layerIds: string[],
  name?: string,
): { doc: IconDoc; groupId: string } => {
  const ids = new Set(layerIds)
  const selected = allLayers(doc).filter((l) => ids.has(l.id))
  if (selected.length === 0) return { doc, groupId: '' }

  const topIndex = doc.groups.findIndex((g) => g.layers.some((l) => ids.has(l.id)))
  const groups = doc.groups.map((g) => {
    const layers = g.layers.filter((l) => !ids.has(l.id))
    return layers.length === g.layers.length ? g : { ...g, layers }
  })
  const newGroup = createGroup(name ?? nextGroupName(doc), selected)
  groups.splice(topIndex, 0, newGroup)
  return { doc: { ...doc, groups }, groupId: newGroup.id }
}

export const ungroup = (doc: IconDoc, groupId: string): IconDoc => removeGroup(doc, groupId, true)

export const mergeLayers = (
  doc: IconDoc,
  layerIds: string[],
  merge: (layers: Layer[]) => Layer,
): IconDoc => {
  const ids = new Set(layerIds)
  if (ids.size === 0) return doc
  const locations = [...ids].map((id) => findLayer(doc, id))
  if (locations.some((l) => l === null)) return doc
  const groupIds = new Set(locations.map((l) => (l as LayerLocation).group.id))
  if (groupIds.size !== 1) return doc

  const groupIndex = (locations[0] as LayerLocation).groupIndex
  const group = doc.groups[groupIndex] as Group
  const minIndex = group.layers.reduce(
    (min, l, i) => (ids.has(l.id) && i < min ? i : min),
    group.layers.length,
  )
  const selectedLayers = group.layers.filter((l) => ids.has(l.id))
  const merged = merge(selectedLayers)
  const layers = group.layers.filter((l) => !ids.has(l.id))
  layers.splice(minIndex, 0, merged)
  const groups = [...doc.groups]
  groups[groupIndex] = { ...group, layers }
  return { ...doc, groups }
}

export const splitLayer = (
  doc: IconDoc,
  layerId: string,
  split: (layer: Layer) => Layer[],
): IconDoc => {
  const loc = findLayer(doc, layerId)
  if (!loc) return doc
  const replacement = split(loc.layer)
  const layers = [...loc.group.layers]
  layers.splice(loc.layerIndex, 1, ...replacement)
  const groups = [...doc.groups]
  groups[loc.groupIndex] = { ...loc.group, layers }
  return { ...doc, groups }
}

export const applyFixResult = (doc: IconDoc, layerId: string, fixed: Layer | null): IconDoc => {
  const loc = findLayer(doc, layerId)
  if (!loc) return doc
  if (fixed === null) return removeLayers(doc, [layerId])
  const layers = [...loc.group.layers]
  layers[loc.layerIndex] = fixed
  const groups = [...doc.groups]
  groups[loc.groupIndex] = { ...loc.group, layers }
  return { ...doc, groups }
}

export const setDocFill = (
  doc: IconDoc,
  appearance: 'default' | 'dark',
  fill: Fill | undefined,
): IconDoc => {
  if (appearance === 'dark') {
    if (fill === undefined) {
      const { dark: _dark, ...rest } = doc.fill
      return { ...doc, fill: rest }
    }
    return { ...doc, fill: { ...doc.fill, dark: fill } }
  }
  if (fill === undefined) return doc
  return { ...doc, fill: { ...doc.fill, default: fill } }
}

export const renameDoc = (doc: IconDoc, name: string): IconDoc => ({ ...doc, name })

export const setWatchOS = (doc: IconDoc, on: boolean): IconDoc => ({ ...doc, watchOS: on })

export const usesIC2Features = (doc: IconDoc): boolean =>
  doc.groups.some(
    (g) => g.glass.specularPlacement !== undefined || g.glass.refractivity !== undefined,
  )
