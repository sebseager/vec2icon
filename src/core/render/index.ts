/** Renderer entry point: WebGL2 when available, Canvas 2D otherwise. */
import { createFlatRenderer } from './flat'
import { createGlRenderer } from './gl/renderer'
import type { Renderer, RenderOptions, Wallpaper } from './types'

export type { Renderer, RenderOptions, Wallpaper }

/**
 * Create a renderer for `canvas`. Falls back to the flat Canvas 2D compositor
 * when WebGL2 is unavailable; check `renderer.kind` to show the
 * "Flat preview (WebGL unavailable)" label.
 */
export const createRenderer = (canvas: HTMLCanvasElement): Renderer =>
  createGlRenderer(canvas) ?? createFlatRenderer(canvas)
