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

/** The layer's new rotation after sweeping the pointer around the pivot. */
export const rotateResult = ({
  startRotation,
  pivot,
  startPointer,
  pointer,
  snap,
}: RotateInput): number => {
  const delta = pointerAngle(pivot, pointer) - pointerAngle(pivot, startPointer)
  const rotation = normalizeAngle(startRotation + delta)
  return snap ? normalizeAngle(snapToStep(rotation, ROTATION_SNAP_STEP)) : rotation
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

/** `transform` scaled by `factors`, never below the minimum. */
export const applyScale = (
  transform: Transform,
  factors: ScaleFactors,
): { scaleX: number; scaleY: number } => ({
  scaleX: clampScale(transform.scaleX * factors.x),
  scaleY: clampScale(transform.scaleY * factors.y),
})

/** The handled layer's new scale after dragging a corner handle. */
export const scaleResult = (input: ScaleInput): { scaleX: number; scaleY: number } =>
  applyScale(input.startTransform, scaleFactors(input))
