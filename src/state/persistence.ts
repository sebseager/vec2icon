/** IndexedDB-backed autosave for the editor doc. */
import { del, get, set } from 'idb-keyval'
import type { IconDoc } from '../core/model/types'
import type { useEditor } from './store'

export const AUTOSAVE_KEY = 'vec2icon:doc'
export const AUTOSAVE_MS = 500

export type KV = {
  get(key: string): Promise<unknown>
  set(key: string, v: unknown): Promise<void>
  del(key: string): Promise<void>
}

export const idbKV: KV = { get, set, del }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** Enough of an `IconDoc` to load without crashing the renderer: a name, groups that
 * each carry a `layers` array, and the document fill the whole canvas is painted from.
 * Anything else in storage is another app's key, or a doc from an older shape. */
const isIconDocShape = (value: unknown): value is IconDoc => {
  if (!isRecord(value)) return false
  if (typeof value.name !== 'string') return false
  if (!isRecord(value.fill) || !isRecord(value.fill.default)) return false
  const { groups } = value
  return Array.isArray(groups) && groups.every((g) => isRecord(g) && Array.isArray(g.layers))
}

/** Subscribes to doc changes and writes to `kv` `AUTOSAVE_MS` after the last change
 * in a burst. Returns an unsubscribe function that also cancels any pending write. */
export const startAutosave = (store: typeof useEditor, kv: KV = idbKV): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null

  const unsubscribe = store.subscribe((state, prevState) => {
    if (state.doc === prevState.doc) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void kv.set(AUTOSAVE_KEY, state.doc)
    }, AUTOSAVE_MS)
  })

  return () => {
    if (timer !== null) clearTimeout(timer)
    unsubscribe()
  }
}

export const loadAutosave = async (kv: KV = idbKV): Promise<IconDoc | null> => {
  const value = await kv.get(AUTOSAVE_KEY)
  return isIconDocShape(value) ? value : null
}

export const clearAutosave = (kv: KV = idbKV): Promise<void> => kv.del(AUTOSAVE_KEY)
