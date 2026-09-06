/** Sizing the canvas stage and mapping screen coordinates onto it. */
import { CANVAS_SIZE } from '@/core/model/types'
import type { Point } from './bbox'

/** Breathing room around the fitted canvas, in CSS pixels: enough for the preview
 * caption to sit in the gutter beneath the stage without touching it. */
export const FIT_PADDING = 56
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4
/** How much one wheel notch changes the zoom multiplier. */
export const ZOOM_STEP = 0.1

/** Side of the largest square that fits `width` x `height` with padding. */
export const fitSize = (width: number, height: number, padding = FIT_PADDING): number =>
  Math.max(1, Math.min(width, height) - padding)

/** Side of the drawn canvas. `zoom` 0 means fit-to-view; anything else
 * multiplies the fitted size. */
export const stageSize = (width: number, height: number, zoom: number): number => {
  const fit = fitSize(width, height)
  return zoom === 0 ? fit : fit * zoom
}

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

/** One wheel notch away from `zoom`; scrolling up zooms in. Zoom 0 (fit) counts
 * as 1 so the first notch steps off the fitted size. */
export const nextZoom = (zoom: number, deltaY: number): number => {
  const base = zoom === 0 ? 1 : zoom
  const stepped = base + (deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
  return clampZoom(Math.round(stepped * 100) / 100)
}

/** A client point in canvas points, given the stage's top-left and its drawn side. */
export const toCanvasPoint = (
  client: Point,
  rect: { left: number; top: number },
  size: number,
): Point => {
  if (size <= 0) return { x: 0, y: 0 }
  const scale = CANVAS_SIZE / size
  return { x: (client.x - rect.left) * scale, y: (client.y - rect.top) * scale }
}
