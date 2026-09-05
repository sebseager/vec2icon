import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyDoc } from '../core/model/defaults'
import type { IconDoc } from '../core/model/types'
import {
  AUTOSAVE_KEY,
  AUTOSAVE_MS,
  clearAutosave,
  type KV,
  loadAutosave,
  startAutosave,
} from './persistence'
import { useEditor } from './store'

const createMemoryKV = (): KV & { store: Map<string, unknown> } => {
  const store = new Map<string, unknown>()
  return {
    store,
    get: async (key) => store.get(key),
    set: async (key, v) => {
      store.set(key, v)
    },
    del: async (key) => {
      store.delete(key)
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  useEditor.setState({ doc: emptyDoc('Initial') })
  useEditor.temporal.getState().clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startAutosave', () => {
  it('writes the doc to the KV store 500ms after a change', async () => {
    const kv = createMemoryKV()
    const stop = startAutosave(useEditor, kv)

    useEditor.getState().renameDoc('Changed')
    expect(kv.store.has(AUTOSAVE_KEY)).toBe(false)

    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)
    expect((kv.store.get(AUTOSAVE_KEY) as IconDoc).name).toBe('Changed')
    stop()
  })

  it('debounces rapid changes into a single write of the latest doc', async () => {
    const kv = createMemoryKV()
    const stop = startAutosave(useEditor, kv)

    useEditor.getState().renameDoc('A')
    await vi.advanceTimersByTimeAsync(100)
    useEditor.getState().renameDoc('B')
    await vi.advanceTimersByTimeAsync(100)
    useEditor.getState().renameDoc('C')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)

    expect((kv.store.get(AUTOSAVE_KEY) as IconDoc).name).toBe('C')
    stop()
  })

  it('stops writing once the returned unsubscribe is called', async () => {
    const kv = createMemoryKV()
    const stop = startAutosave(useEditor, kv)
    stop()

    useEditor.getState().renameDoc('After stop')
    await vi.advanceTimersByTimeAsync(AUTOSAVE_MS)

    expect(kv.store.has(AUTOSAVE_KEY)).toBe(false)
  })
})

describe('loadAutosave', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadAutosave(createMemoryKV())).toBeNull()
  })

  it('returns the doc when the stored value has the minimal shape', async () => {
    const kv = createMemoryKV()
    const doc = emptyDoc('Stored')
    await kv.set(AUTOSAVE_KEY, doc)
    expect(await loadAutosave(kv)).toEqual(doc)
  })

  it('returns null for a value missing groups or name', async () => {
    const kv = createMemoryKV()
    await kv.set(AUTOSAVE_KEY, { name: 'X' })
    expect(await loadAutosave(kv)).toBeNull()
    await kv.set(AUTOSAVE_KEY, { groups: [] })
    expect(await loadAutosave(kv)).toBeNull()
    await kv.set(AUTOSAVE_KEY, 'not an object')
    expect(await loadAutosave(kv)).toBeNull()
  })

  it('returns null for a doc whose groups or fill are the wrong shape', async () => {
    const kv = createMemoryKV()
    const doc = emptyDoc('Stored')
    await kv.set(AUTOSAVE_KEY, { ...doc, groups: [{ name: 'G' }] })
    expect(await loadAutosave(kv)).toBeNull()
    await kv.set(AUTOSAVE_KEY, { ...doc, groups: ['nope'] })
    expect(await loadAutosave(kv)).toBeNull()
    const { fill: _fill, ...noFill } = doc
    await kv.set(AUTOSAVE_KEY, noFill)
    expect(await loadAutosave(kv)).toBeNull()
  })
})

describe('clearAutosave', () => {
  it('removes the stored doc', async () => {
    const kv = createMemoryKV()
    await kv.set(AUTOSAVE_KEY, emptyDoc())
    await clearAutosave(kv)
    expect(kv.store.has(AUTOSAVE_KEY)).toBe(false)
  })
})
