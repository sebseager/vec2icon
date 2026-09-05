/** Snapping a dragged bounding box to the canvas centre and the platform safe area. */
import type { BBox } from '@/core/model/types'
import { CANVAS_SIZE } from '@/core/model/types'

/** Canvas points a candidate may be away from its target and still snap. */
export const SNAP_TOLERANCE = 4

export type Delta = { dx: number; dy: number }

/** The smallest of the offered [value, target] adjustments that is within
 * `tolerance`, or 0 when none of them are. */
const nearestAdjustment = (pairs: Array<[number, number]>, tolerance: number): number => {
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (const [value, target] of pairs) {
    const adjustment = target - value
    const distance = Math.abs(adjustment)
    if (distance <= tolerance && distance < bestDistance) {
      best = adjustment
      bestDistance = distance
    }
  }
  return best
}

/**
 * `delta` adjusted so the moved `box` lines up with the canvas centre (centre to
 * centre) or the `safe` area (edge to edge) when it lands within `tolerance`
 * points of one. Each axis snaps on its own.
 */
export const snapMove = (
  box: BBox,
  delta: Delta,
  safe: BBox,
  tolerance = SNAP_TOLERANCE,
): Delta => {
  const centre = CANVAS_SIZE / 2
  const left = box.x + delta.dx
  const top = box.y + delta.dy
  return {
    dx:
      delta.dx +
      nearestAdjustment(
        [
          [left, safe.x],
          [left + box.width / 2, centre],
          [left + box.width, safe.x + safe.width],
        ],
        tolerance,
      ),
    dy:
      delta.dy +
      nearestAdjustment(
        [
          [top, safe.y],
          [top + box.height / 2, centre],
          [top + box.height, safe.y + safe.height],
        ],
        tolerance,
      ),
  }
}
