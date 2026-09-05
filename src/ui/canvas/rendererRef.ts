/** The renderer the canvas pane currently owns, so the export dialog can ask it
 * for a glass-approximating flat PNG without threading it through React. */
import type { Renderer } from '@/core/render'

let active: Renderer | null = null

export const setActiveRenderer = (renderer: Renderer | null): void => {
  active = renderer
}

export const getActiveRenderer = (): Renderer | null => active
