/** Editor store: zustand + zundo (undo/redo tracks `doc` only). */
import { type TemporalState, temporal } from 'zundo'
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { emptyDoc, newId } from '../core/model/defaults'
import * as ops from '../core/model/ops'
import type {
  Appearance,
  Color,
  Fill,
  Glass,
  Group,
  IconDoc,
  Issue,
  IssueCode,
  IssueFix,
  Layer,
  LayerOverride,
  Platform,
  Rendition,
  Transform,
} from '../core/model/types'
import { relintLayers } from '../core/svg'

export const COALESCE_MS = 300

/** Commit option for edits that change layer membership or order, so the affected
 * groups are linted again against their new shape. */
const STRUCTURAL = { relint: true } as const

export type Wallpaper = 'light' | 'dark' | 'gradient-blue' | 'gradient-warm' | 'checker'

export type Selection = { layerIds: string[]; groupId: string | null }

export type View = {
  rendition: Rendition
  platform: Platform
  wallpaper: Wallpaper
  lightAngle: number
  tint: Color
  appearance: Appearance
  zoom: number
  issuesOpen: boolean
  exportOpen: boolean
  helpOpen: boolean
  composeOpen: boolean
  /** The layer AI Adjust is open for, if any. */
  adjustLayerId: string | null
}

export type Toast = {
  id: string
  message: string
  action?: { label: string; onClick: () => void }
}

export type EditorState = {
  doc: IconDoc
  selection: Selection
  view: View
  toasts: Toast[]

  setDoc(doc: IconDoc, opts?: { silent?: boolean }): void
  importGroups(groups: Group[]): void
  /** One undo step: the composed groups, the background they came with, and a name for an empty doc. */
  importComposed(groups: Group[], fill: Fill | null, name: string): void

  updateLayer(layerId: string, patch: Partial<Layer> | ((l: Layer) => Layer)): void
  updateLayers(layerIds: string[], patch: Partial<Layer> | ((l: Layer) => Layer)): void
  updateGroup(groupId: string, patch: Partial<Group> | ((g: Group) => Group)): void
  setGlass(groupId: string, patch: Partial<Glass>): void
  setLayerOverride(
    layerId: string,
    appearance: 'dark' | 'mono',
    patch: Partial<LayerOverride> | null,
  ): void
  setTransform(layerId: string, patch: Partial<Transform>): void
  setTransforms(patches: Record<string, Partial<Transform>>): void
  nudgeLayers(layerIds: string[], dx: number, dy: number): void
  addGroups(groups: Group[], index?: number): void
  addLayersToGroup(groupId: string, layers: Layer[], index?: number): void
  removeLayers(layerIds: string[]): void
  removeGroup(groupId: string, keepLayers: boolean): void
  moveLayer(layerId: string, toGroupId: string, toIndex: number): void
  moveGroup(groupId: string, toIndex: number): void
  duplicateLayers(layerIds: string[]): void
  groupFromLayers(layerIds: string[], name?: string): void
  ungroup(groupId: string): void
  mergeLayers(layerIds: string[], merge: (layers: Layer[]) => Layer): void
  splitLayer(layerId: string, split: (layer: Layer) => Layer[]): void
  applyFixResult(layerId: string, fixed: Layer | null): void
  applyFix(
    layerId: string,
    code: IssueCode,
    fixId: string,
    fixed: Layer | null,
    docFill?: Fill,
  ): void
  setDocFill(appearance: 'default' | 'dark', fill: Fill | undefined): void
  renameDoc(name: string): void
  setWatchOS(on: boolean): void

  select(layerIds: string[], opts?: { additive?: boolean }): void
  selectGroup(groupId: string | null): void
  clearSelection(): void

  setView(patch: Partial<View>): void

  pushToast(t: Omit<Toast, 'id'>): string
  dismissToast(id: string): void

  beginGesture(): void
  endGesture(): void
  commitCoalesced(fn: (doc: IconDoc) => IconDoc): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
}

const initialSelection = (): Selection => ({ layerIds: [], groupId: null })

const initialView = (): View => ({
  rendition: 'default',
  platform: 'ios',
  wallpaper: 'light',
  lightAngle: 315,
  tint: { space: 'srgb', components: [0.2, 0.5, 1, 1] },
  appearance: 'default',
  zoom: 0,
  issuesOpen: false,
  exportOpen: false,
  helpOpen: false,
  composeOpen: false,
  adjustLayerId: null,
})

const sameFixes = (a: IssueFix[], b: IssueFix[]): boolean =>
  a.length === b.length &&
  a.every((fix, i) => {
    const other = b[i]
    return (
      other !== undefined &&
      fix.id === other.id &&
      fix.label === other.label &&
      fix.warning === other.warning
    )
  })

const sameIssues = (a: Issue[], b: Issue[]): boolean =>
  a.length === b.length &&
  a.every((issue, i) => {
    const other = b[i]
    return (
      other !== undefined &&
      issue.code === other.code &&
      issue.message === other.message &&
      issue.help === other.help &&
      sameFixes(issue.fixes, other.fixes)
    )
  })

/**
 * Re-lint every group after a change to layer membership or order. Issues like
 * "bottom layer looks like a background" depend on a layer's position, and split /
 * merge hand back layers with no issues at all, so a structural edit invalidates
 * whatever the layers were carrying. Layers whose issues come back identical keep
 * their old reference, so an edit that changes nothing produces no new doc and no
 * spurious history entry.
 */
const relintDoc = (doc: IconDoc): IconDoc => {
  let docChanged = false
  const groups = doc.groups.map((group) => {
    const relinted = relintLayers(group.layers)
    let groupChanged = false
    const layers = group.layers.map((layer, i) => {
      const next = relinted[i]
      if (next === undefined || sameIssues(layer.issues, next.issues)) return layer
      groupChanged = true
      return next
    })
    if (!groupChanged) return group
    docChanged = true
    return { ...group, layers }
  })
  return docChanged ? { ...doc, groups } : doc
}

/** Drop selected ids that no longer exist in `doc`; returns `selection` unchanged if nothing to prune. */
const pruneSelection = (doc: IconDoc, selection: Selection): Selection => {
  const layerIds = selection.layerIds.filter((id) => ops.findLayer(doc, id) !== null)
  const groupId =
    selection.groupId !== null && ops.findGroup(doc, selection.groupId) !== null
      ? selection.groupId
      : null
  if (layerIds.length === selection.layerIds.length && groupId === selection.groupId) {
    return selection
  }
  return { layerIds, groupId }
}

type EditorStore = UseBoundStore<
  StoreApi<EditorState> & { temporal: StoreApi<TemporalState<{ doc: IconDoc }>> }
>

/** Named owners that can each independently hold `temporal` paused. Tracking is paused while
 * *any* owner holds it, and only resumed once *every* owner has released it — this is what lets a
 * gesture and a coalesce burst overlap (one starting before the other has finished) without either
 * one clobbering the other's pause/resume. */
type SuspendOwner = 'gesture' | 'coalesce' | 'silent'

export const useEditor: EditorStore = create<EditorState>()(
  temporal<EditorState, [], [], { doc: IconDoc }>(
    (set, get) => {
      const suspendedBy = new Set<SuspendOwner>()
      const suspend = (owner: SuspendOwner): void => {
        const wasEmpty = suspendedBy.size === 0
        suspendedBy.add(owner)
        if (wasEmpty) useEditor.temporal.getState().pause()
      }
      const unsuspend = (owner: SuspendOwner): void => {
        if (!suspendedBy.has(owner)) return
        suspendedBy.delete(owner)
        if (suspendedBy.size === 0) useEditor.temporal.getState().resume()
      }

      /** True from `beginGesture()` until the first doc-changing commit inside it. */
      let gesturePending = false
      /** Pending "close the coalesce burst" callback; also used to detect a live burst. */
      let coalesceTimer: ReturnType<typeof setTimeout> | null = null

      /** Cancels any pending coalesce burst and closes it out immediately (as its own undo step),
       * so a gesture starting mid-burst never races the burst's own debounce timer. */
      const flushCoalesce = (): void => {
        if (coalesceTimer !== null) {
          clearTimeout(coalesceTimer)
          coalesceTimer = null
        }
        unsuspend('coalesce')
      }

      /** Applies `fn` to the current doc and commits it, unless it is a no-op (same reference).
       * `opts.silent` suppresses history for this one set. `opts.coalesced` merges consecutive
       * calls within `COALESCE_MS` of each other into a single undo step. Plain calls (neither
       * option) record normally unless made mid-gesture, in which case only the first one is
       * recorded and it also pauses history until `endGesture()`. */
      const commit = (
        fn: (doc: IconDoc) => IconDoc,
        opts?: { silent?: boolean; coalesced?: boolean; relint?: boolean },
      ): void => {
        const before = get().doc
        const produced = fn(before)
        if (produced === before) return
        const after = opts?.relint ? relintDoc(produced) : produced

        if (opts?.silent) {
          suspend('silent')
          set({ doc: after })
          unsuspend('silent')
          return
        }

        if (opts?.coalesced) {
          const wasCoalescing = suspendedBy.has('coalesce')
          if (coalesceTimer !== null) clearTimeout(coalesceTimer)
          set({ doc: after })
          if (!wasCoalescing) suspend('coalesce')
          coalesceTimer = setTimeout(() => {
            coalesceTimer = null
            unsuspend('coalesce')
          }, COALESCE_MS)
          return
        }

        set({ doc: after })
        if (gesturePending) {
          gesturePending = false
          suspend('gesture')
        }
      }

      return {
        doc: emptyDoc(),
        selection: initialSelection(),
        view: initialView(),
        toasts: [],

        setDoc: (doc, opts) => commit(() => doc, { silent: opts?.silent }),

        importGroups: (groups) => {
          commit((doc) => ops.addGroups(doc, groups, 0), STRUCTURAL)
          const first = groups.flatMap((g) => g.layers)[0]
          if (first) get().select([first.id])
        },

        importComposed: (groups, fill, name) => {
          commit((doc) => {
            const named = doc.groups.length === 0 ? ops.renameDoc(doc, name) : doc
            const filled = fill ? ops.setDocFill(named, 'default', fill) : named
            return ops.addGroups(filled, groups, 0)
          }, STRUCTURAL)
          const first = groups.flatMap((g) => g.layers)[0]
          if (first) get().select([first.id])
        },

        updateLayer: (layerId, patch) => commit((doc) => ops.updateLayer(doc, layerId, patch)),
        updateLayers: (layerIds, patch) => commit((doc) => ops.updateLayers(doc, layerIds, patch)),
        updateGroup: (groupId, patch) => commit((doc) => ops.updateGroup(doc, groupId, patch)),
        setGlass: (groupId, patch) => commit((doc) => ops.setGlass(doc, groupId, patch)),
        setLayerOverride: (layerId, appearance, patch) =>
          commit((doc) => ops.setLayerOverride(doc, layerId, appearance, patch)),
        setTransform: (layerId, patch) => commit((doc) => ops.setTransform(doc, layerId, patch)),
        setTransforms: (patches) => commit((doc) => ops.setTransforms(doc, patches)),
        nudgeLayers: (layerIds, dx, dy) => commit((doc) => ops.nudgeLayers(doc, layerIds, dx, dy)),
        addGroups: (groups, index) =>
          commit((doc) => ops.addGroups(doc, groups, index), STRUCTURAL),
        addLayersToGroup: (groupId, layers, index) =>
          commit((doc) => ops.addLayersToGroup(doc, groupId, layers, index), STRUCTURAL),
        removeLayers: (layerIds) => commit((doc) => ops.removeLayers(doc, layerIds), STRUCTURAL),
        removeGroup: (groupId, keepLayers) =>
          commit((doc) => ops.removeGroup(doc, groupId, keepLayers), STRUCTURAL),
        moveLayer: (layerId, toGroupId, toIndex) =>
          commit((doc) => ops.moveLayer(doc, layerId, toGroupId, toIndex), STRUCTURAL),
        moveGroup: (groupId, toIndex) => commit((doc) => ops.moveGroup(doc, groupId, toIndex)),

        duplicateLayers: (layerIds) => {
          let newIds: string[] = []
          commit((doc) => {
            const result = ops.duplicateLayers(doc, layerIds)
            newIds = result.newIds
            return result.doc
          }, STRUCTURAL)
          if (newIds.length > 0) get().select(newIds)
        },

        groupFromLayers: (layerIds, name) => {
          let groupId = ''
          commit((doc) => {
            const result = ops.groupFromLayers(doc, layerIds, name)
            groupId = result.groupId
            return result.doc
          }, STRUCTURAL)
          if (groupId) get().selectGroup(groupId)
        },

        ungroup: (groupId) => commit((doc) => ops.ungroup(doc, groupId), STRUCTURAL),
        mergeLayers: (layerIds, merge) =>
          commit((doc) => ops.mergeLayers(doc, layerIds, merge), STRUCTURAL),
        splitLayer: (layerId, split) =>
          commit((doc) => ops.splitLayer(doc, layerId, split), STRUCTURAL),
        applyFixResult: (layerId, fixed) =>
          commit((doc) => ops.applyFixResult(doc, layerId, fixed), STRUCTURAL),

        applyFix: (layerId, _code, _fixId, fixed, docFill) => {
          commit((doc) => {
            const next = ops.applyFixResult(doc, layerId, fixed)
            return docFill !== undefined ? ops.setDocFill(next, 'default', docFill) : next
          }, STRUCTURAL)
        },

        setDocFill: (appearance, fill) => commit((doc) => ops.setDocFill(doc, appearance, fill)),
        renameDoc: (name) => commit((doc) => ops.renameDoc(doc, name)),
        setWatchOS: (on) => commit((doc) => ops.setWatchOS(doc, on)),

        select: (layerIds, opts) =>
          set((state) => ({
            selection: opts?.additive
              ? {
                  layerIds: Array.from(new Set([...state.selection.layerIds, ...layerIds])),
                  groupId: null,
                }
              : { layerIds: [...layerIds], groupId: null },
          })),
        selectGroup: (groupId) => set({ selection: { layerIds: [], groupId } }),
        clearSelection: () => set({ selection: initialSelection() }),

        setView: (patch) => set((state) => ({ view: { ...state.view, ...patch } })),

        pushToast: (t) => {
          const id = newId()
          set((state) => ({ toasts: [...state.toasts, { ...t, id }] }))
          return id
        },
        dismissToast: (id) =>
          set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

        beginGesture: () => {
          // Close out any pending slider burst as its own undo step before the gesture starts,
          // so its debounce timer can't fire mid-drag and resume tracking out from under it.
          flushCoalesce()
          gesturePending = true
        },
        endGesture: () => {
          gesturePending = false
          unsuspend('gesture')
        },

        commitCoalesced: (fn) => commit(fn, { coalesced: true }),

        undo: () => useEditor.temporal.getState().undo(),
        redo: () => useEditor.temporal.getState().redo(),
        canUndo: () => useEditor.temporal.getState().pastStates.length > 0,
        canRedo: () => useEditor.temporal.getState().futureStates.length > 0,
      }
    },
    {
      partialize: (state) => ({ doc: state.doc }),
      equality: (a, b) => a.doc === b.doc,
    },
  ),
)

useEditor.subscribe((state, prevState) => {
  if (state.doc === prevState.doc) return
  const pruned = pruneSelection(state.doc, state.selection)
  if (pruned !== state.selection) {
    useEditor.setState({ selection: pruned })
  }
})
