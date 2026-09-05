/** Global editor keyboard shortcuts, dispatched against the store's action surface. */
import type { EditorState } from './store'

type EditorKeyEvent = {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  target?: EventTarget | null
  /** A control that already acted on the key sets this; the editor must not act again. */
  defaultPrevented?: boolean
}

/** Elements that own the keyboard while focused. */
const TEXT_ENTRY = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * Widgets whose own key handling (arrows, Delete, Escape, Space) must win over the
 * global shortcuts: Base UI's popups and tab strips, and dnd-kit's keyboard sortable
 * handles, which drive a drag from the arrow keys.
 */
const WIDGET_SELECTOR =
  '[role="listbox"], [role="tablist"], [role="group"], [role="menu"], [role="dialog"], [aria-roledescription="sortable"]'

/** Duck-typed rather than `instanceof HTMLElement`: the event may come from another
 * document or realm (a portal in an iframe, a test's synthetic target), where the
 * constructor identity differs but the DOM surface is the same. */
type MaybeElement = {
  tagName?: unknown
  isContentEditable?: unknown
  closest?: (selector: string) => unknown
}

const isEditableTarget = (target?: EventTarget | null): boolean => {
  const el = target as MaybeElement | null | undefined
  if (!el) return false
  if (el.isContentEditable === true) return true
  if (typeof el.tagName === 'string' && TEXT_ENTRY.has(el.tagName.toUpperCase())) return true
  return typeof el.closest === 'function' && el.closest(WIDGET_SELECTOR) !== null
}

const isMod = (e: EditorKeyEvent): boolean => e.metaKey || e.ctrlKey
const lowerKey = (e: EditorKeyEvent): string => e.key.toLowerCase()

const ARROW_DELTA: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

/** Dispatches a keyboard event against the editor store's actions. Returns true when handled. */
export const handleEditorKey = (e: EditorKeyEvent, s: EditorState): boolean => {
  if (e.defaultPrevented) return false
  if (isEditableTarget(e.target)) return false

  if (isMod(e) && !e.shiftKey && lowerKey(e) === 'z') {
    s.undo()
    return true
  }
  if ((isMod(e) && e.shiftKey && lowerKey(e) === 'z') || (e.ctrlKey && lowerKey(e) === 'y')) {
    s.redo()
    return true
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (s.selection.groupId !== null) {
      s.removeGroup(s.selection.groupId, false)
    } else {
      s.removeLayers(s.selection.layerIds)
    }
    return true
  }
  if (isMod(e) && lowerKey(e) === 'd') {
    s.duplicateLayers(s.selection.layerIds)
    return true
  }
  if (isMod(e) && lowerKey(e) === 'g') {
    s.groupFromLayers(s.selection.layerIds)
    return true
  }
  if (e.key === 'Escape') {
    s.clearSelection()
    return true
  }
  const delta = ARROW_DELTA[e.key]
  if (delta) {
    const step = e.shiftKey ? 10 : 1
    s.nudgeLayers(s.selection.layerIds, delta[0] * step, delta[1] * step)
    return true
  }

  return false
}
