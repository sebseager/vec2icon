/** Pure math behind the canvas drag gestures. Pointer wiring lives in the component. */
import type { Transform } from '@/core/model/types'
import type { Point } from './bbox'

/** A layer can never be scaled smaller than this. */
export const MIN_SCALE = 0.01
/** Rotation step Shift snaps to, in degrees. */
export const ROTATION_SNAP_STEP = 15

const DEG = 180 / Math.PI

/** Degrees clockwise from the +x axis, in the y-down canvas space. */
export const pointerAngle = (pivot: Point, p: Point): number =>
  Math.atan2(p.y - pivot.y, p.x - pivot.x) * DEG

/** Degrees clockwise from straight up — the convention the light angle uses. */
export const angleFromTop = (centre: Point, p: Point): number =>
  normalizeAngle(Math.atan2(p.x - centre.x, centre.y - p.y) * DEG)

export const normalizeAngle = (deg: number): number => ((deg % 360) + 360) % 360

export const snapToStep = (deg: number, step: number): number => Math.round(deg / step) * step

export type RotateInput = {
  startRotation: number
  pivot: Point
  startPointer: Point
  pointer: Point
  snap: boolean
}

/**
 * How far a rotate drag turns, in degrees, before it lands on any layer. The same
 * delta goes on every selected layer, so a multi-selection turns together. Snapping
 * lands the held layer on a step and turns the rest by that same adjusted amount.
 */
export const rotateDelta = ({
  startRotation,
  pivot,
  startPointer,
  pointer,
  snap,
}: RotateInput): number => {
  const delta = pointerAngle(pivot, pointer) - pointerAngle(pivot, startPointer)
  if (!snap) return delta
  return snapToStep(startRotation + delta, ROTATION_SNAP_STEP) - startRotation
}

/**
 * `transform` turned by `delta` degrees about `pivot`, wrapped into 0..360. `centre` is
 * where the layer's own pivot sits now; it orbits `pivot` by the same sweep, so a
 * multi-selection turns as one rigid piece rather than each layer spinning in place.
 */
export const applyRotation = (
  transform: Transform,
  delta: number,
  centre: Point,
  pivot: Point,
): { rotation: number; x: number; y: number } => {
  const rad = delta / DEG
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = centre.x - pivot.x
  const dy = centre.y - pivot.y
  return {
    rotation: normalizeAngle(transform.rotation + delta),
    x: transform.x + (dx * cos - dy * sin) - dx,
    y: transform.y + (dx * sin + dy * cos) - dy,
  }
}

export type ScaleInput = {
  startTransform: Transform
  pivot: Point
  startPointer: Point
  pointer: Point
  /** Shift: scale each axis on its own. Ignored on a rotated layer. */
  freeAxis: boolean
}

const clampScale = (n: number): number => (Math.abs(n) < MIN_SCALE ? MIN_SCALE : n)

/** A ratio of pointer distances, or 1 when the handle started on the pivot. */
const ratio = (from: number, to: number): number => (from === 0 ? 1 : to / from)

export type ScaleFactors = { x: number; y: number }

/**
 * How much a corner drag scales, per axis, before it lands on any layer. The same
 * factors go on every selected layer, so a multi-selection scales together.
 */
export const scaleFactors = ({
  startTransform,
  pivot,
  startPointer,
  pointer,
  freeAxis,
}: ScaleInput): ScaleFactors => {
  // Per-axis scaling is only meaningful while the layer's axes are the canvas
  // axes; on a rotated layer it falls back to uniform, as the brief allows.
  if (freeAxis && startTransform.rotation === 0) {
    return {
      x: ratio(startPointer.x - pivot.x, pointer.x - pivot.x),
      y: ratio(startPointer.y - pivot.y, pointer.y - pivot.y),
    }
  }
  const factor = ratio(
    Math.hypot(startPointer.x - pivot.x, startPointer.y - pivot.y),
    Math.hypot(pointer.x - pivot.x, pointer.y - pivot.y),
  )
  return { x: factor, y: factor }
}

/**
 * `transform` scaled by `factors`, never below the minimum. `centre` is where the layer's
 * own pivot sits now; it is drawn toward `pivot` by the same factors, so a multi-selection
 * shrinks or grows as one piece and the gaps between layers scale with the layers.
 */
export const applyScale = (
  transform: Transform,
  factors: ScaleFactors,
  centre: Point,
  pivot: Point,
): { scaleX: number; scaleY: number; x: number; y: number } => ({
  scaleX: clampScale(transform.scaleX * factors.x),
  scaleY: clampScale(transform.scaleY * factors.y),
  x: transform.x + (factors.x - 1) * (centre.x - pivot.x),
  y: transform.y + (factors.y - 1) * (centre.y - pivot.y),
})
