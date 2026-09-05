import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGroup, createLayer, emptyDoc } from '../core/model/defaults'
import type { BBox, Group, IconDoc, Layer, ViewBox } from '../core/model/types'
import { useEditor } from './store'

const SVG = '<g><rect width="10" height="10"/></g>'
const VB: ViewBox = [0, 0, 100, 100]
const BBOX: BBox = { x: 0, y: 0, width: 10, height: 10 }

const layer = (name: string): Layer =>
  createLayer({ name, svg: SVG, defs: '', sourceViewBox: VB, bbox: BBOX })

const initialDoc = (): IconDoc => {
  const a = layer('A')
  const b = layer('B')
  return { ...emptyDoc(), groups: [createGroup('G1', [a, b])] }
}

const resetStore = () => {
  useEditor.setState({
    doc: initialDoc(),
    selection: { layerIds: [], groupId: null },
    toasts: [],
  })
  // Defensively release any suspension left behind by a test that didn't clean up after itself:
  // begin+end flushes a pending coalesce burst and clears/releases the gesture owner too.
  useEditor.getState().beginGesture()
  useEditor.getState().endGesture()
  useEditor.temporal.getState().clear()
  useEditor.temporal.getState().resume()
}

beforeEach(() => {
  resetStore()
})

describe('undo/redo', () => {
  it('undoes and redoes a rename', () => {
    const originalName = useEditor.getState().doc.name
    useEditor.getState().renameDoc('Renamed')
    expect(useEditor.getState().doc.name).toBe('Renamed')

    useEditor.getState().undo()
    expect(useEditor.getState().doc.name).toBe(originalName)

    useEditor.getState().redo()
    expect(useEditor.getState().doc.name).toBe('Renamed')
  })

  it('canUndo/canRedo reflect available history', () => {
    expect(useEditor.getState().canUndo()).toBe(false)
    expect(useEditor.getState().canRedo()).toBe(false)
    useEditor.getState().renameDoc('Renamed')
    expect(useEditor.getState().canUndo()).toBe(true)
    expect(useEditor.getState().canRedo()).toBe(false)
    useEditor.getState().undo()
    expect(useEditor.getState().canUndo()).toBe(false)
    expect(useEditor.getState().canRedo()).toBe(true)
  })
})

describe('gestures', () => {
  it('coalesces an entire drag gesture into a single undo step', () => {
    const layerId = useEditor.getState().doc.groups[0]?.layers[0]?.id as string

    useEditor.getState().beginGesture()
    useEditor.getState().nudgeLayers([layerId], 1, 0)
    useEditor.getState().nudgeLayers([layerId], 1, 0)
    useEditor.getState().nudgeLayers([layerId], 1, 0)
    useEditor.getState().endGesture()

    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform.x).toBe(3)
    expect(useEditor.temporal.getState().pastStates).toHaveLength(1)

    useEditor.getState().undo()
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform.x).toBe(0)
  })
})

describe('commitCoalesced', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces edits within the 300ms window into one undo step', () => {
    const set = (name: string) => useEditor.getState().commitCoalesced((doc) => ({ ...doc, name }))

    set('v1')
    vi.advanceTimersByTime(100)
    set('v2')
    vi.advanceTimersByTime(100)
    set('v3')
    vi.advanceTimersByTime(300)

    expect(useEditor.getState().doc.name).toBe('v3')
    expect(useEditor.temporal.getState().pastStates).toHaveLength(1)

    useEditor.getState().undo()
    expect(useEditor.getState().doc.name).not.toBe('v1')
  })

  it('splits edits more than 300ms apart into separate undo steps', () => {
    const set = (name: string) => useEditor.getState().commitCoalesced((doc) => ({ ...doc, name }))

    set('v1')
    vi.advanceTimersByTime(400)
    set('v2')
    vi.advanceTimersByTime(400)

    expect(useEditor.temporal.getState().pastStates).toHaveLength(2)
  })
})

describe('gesture / coalesce interaction (regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes a pending coalesce burst as its own step when a gesture begins mid-debounce', () => {
    const layerId = (useEditor.getState().doc.groups[0] as Group).layers[0]?.id as string

    // slider edit starts a coalesce burst (paused, 300ms timer pending)
    useEditor.getState().commitCoalesced((doc) => ({ ...doc, name: 'slider' }))
    vi.advanceTimersByTime(50)

    // a gesture begins before that timer fires: it must flush/close the burst first
    useEditor.getState().beginGesture()
    useEditor.getState().nudgeLayers([layerId], 1, 0)

    // the coalesce burst's original 300ms deadline elapses; it must NOT resume tracking
    // out from under the still-open gesture
    vi.advanceTimersByTime(300)

    useEditor.getState().nudgeLayers([layerId], 1, 0)
    useEditor.getState().nudgeLayers([layerId], 1, 0)
    useEditor.getState().endGesture()

    expect(useEditor.getState().doc.name).toBe('slider')
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform.x).toBe(3)
    // exactly 2 undo steps: the slider burst, and the gesture (as one step)
    expect(useEditor.temporal.getState().pastStates).toHaveLength(2)

    useEditor.getState().undo()
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform.x).toBe(0)
    useEditor.getState().undo()
    expect(useEditor.getState().doc.name).not.toBe('slider')
  })

  it('starts a fresh, independent coalesce burst after a gesture ends', () => {
    const layerId = (useEditor.getState().doc.groups[0] as Group).layers[0]?.id as string

    useEditor.getState().beginGesture()
    useEditor.getState().nudgeLayers([layerId], 1, 0)
    useEditor.getState().endGesture()

    useEditor.getState().commitCoalesced((doc) => ({ ...doc, name: 'v1' }))
    vi.advanceTimersByTime(100)
    useEditor.getState().commitCoalesced((doc) => ({ ...doc, name: 'v2' }))
    vi.advanceTimersByTime(300)

    expect(useEditor.getState().doc.name).toBe('v2')
    // 1 for the gesture, 1 for the (single, coalesced) post-gesture burst
    expect(useEditor.temporal.getState().pastStates).toHaveLength(2)
  })

  it('does not let a coalesce burst started during a gesture resume tracking early', () => {
    const layerId = (useEditor.getState().doc.groups[0] as Group).layers[0]?.id as string

    useEditor.getState().beginGesture()
    useEditor.getState().nudgeLayers([layerId], 1, 0) // gesture's own commit: pauses after this

    // an edit coalesces while the gesture still holds tracking paused
    useEditor.getState().commitCoalesced((doc) => ({ ...doc, name: 'mid-gesture' }))
    vi.advanceTimersByTime(300) // that burst's own debounce fires

    // still inside the gesture: this commit must still be paused
    useEditor.getState().nudgeLayers([layerId], 1, 0)
    useEditor.getState().endGesture()

    expect(useEditor.getState().doc.name).toBe('mid-gesture')
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform.x).toBe(2)
    // only the gesture's first commit was recorded
    expect(useEditor.temporal.getState().pastStates).toHaveLength(1)

    useEditor.getState().undo()
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform.x).toBe(0)
  })
})

describe('view changes', () => {
  it('do not create history entries', () => {
    useEditor.getState().setView({ zoom: 2 })
    expect(useEditor.getState().view.zoom).toBe(2)
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
  })
})

describe('selection pruning', () => {
  it('prunes layer ids that no longer exist after a delete', () => {
    const layers = useEditor.getState().doc.groups[0]?.layers as Layer[]
    const [a, b] = layers
    useEditor.getState().select([(a as Layer).id, (b as Layer).id])
    useEditor.getState().removeLayers([(a as Layer).id])
    expect(useEditor.getState().selection.layerIds).toEqual([(b as Layer).id])
  })

  it('prunes selection after undo removes the layers again', () => {
    const layers = useEditor.getState().doc.groups[0]?.layers as Layer[]
    const [a, b] = layers
    useEditor.getState().select([(a as Layer).id, (b as Layer).id])
    useEditor.getState().removeLayers([(a as Layer).id])
    useEditor.getState().undo()
    // 'a' exists again after undo, selection was already pruned to [b] and stays that way
    expect(useEditor.getState().selection.layerIds).toEqual([(b as Layer).id])
  })
})

describe('unknown-id ops', () => {
  it('do not change the doc reference or create a history entry', () => {
    const before = useEditor.getState().doc
    useEditor.getState().updateLayer('nope', { name: 'X' })
    expect(useEditor.getState().doc).toBe(before)
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
  })
})

describe('setDoc', () => {
  it('records history by default', () => {
    useEditor.getState().setDoc(emptyDoc('Restored'))
    expect(useEditor.temporal.getState().pastStates).toHaveLength(1)
  })

  it('does not record history when silent', () => {
    useEditor.getState().setDoc(emptyDoc('Restored'), { silent: true })
    expect(useEditor.getState().doc.name).toBe('Restored')
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
  })

  it('short-circuits (no history, no re-render-worthy set) when given the exact same doc reference', () => {
    const same = useEditor.getState().doc
    useEditor.getState().setDoc(same)
    expect(useEditor.getState().doc).toBe(same)
    expect(useEditor.temporal.getState().pastStates).toHaveLength(0)
  })
})

describe('re-linting after structural changes', () => {
  const BACKDROP = '<g><rect width="100" height="100" fill="#0a84ff"/></g>'
  const backdrop = (name: string): Layer =>
    createLayer({
      name,
      svg: BACKDROP,
      defs: '',
      sourceViewBox: VB,
      bbox: { x: 0, y: 0, width: 100, height: 100 },
    })

  const codesOf = (l: Layer | undefined): string[] => (l?.issues ?? []).map((i) => i.code)

  it('flags the new bottom-most layer after a fix removes the old one', () => {
    useEditor.setState({ doc: emptyDoc() })
    useEditor.getState().importGroups([createGroup('G', [backdrop('Top'), backdrop('Bottom')])])

    const imported = useEditor.getState().doc.groups[0]?.layers ?? []
    expect(codesOf(imported[1])).toContain('background')
    expect(codesOf(imported[0])).not.toContain('background')

    const bottom = imported[1] as Layer
    useEditor.getState().applyFix(bottom.id, 'background', 'to-fill', null, {
      kind: 'solid',
      color: { space: 'srgb', components: [0.04, 0.52, 1, 1] },
    })

    const after = useEditor.getState().doc.groups[0]?.layers ?? []
    expect(after).toHaveLength(1)
    expect(codesOf(after[0])).toContain('background')
  })

  it('keeps layer references when a reorder changes no issues', () => {
    const group = useEditor.getState().doc.groups[0] as Group
    const [a, b] = group.layers as [Layer, Layer]
    useEditor.getState().moveLayer(a.id, group.id, 1)

    const after = useEditor.getState().doc.groups[0]?.layers ?? []
    expect(after.map((l) => l.name)).toEqual(['B', 'A'])
    expect(after[0]).toBe(b)
    expect(after[1]).toBe(a)
  })
})
