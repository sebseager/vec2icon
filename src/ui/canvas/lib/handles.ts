/** Positions of the selection handles, and which one a pointer is over. */
import type { BBox } from '@/core/model/types'
import type { Point } from './bbox'

export type CornerHandle = 'nw' | 'ne' | 'sw' | 'se'
export type HandleId = CornerHandle | 'rotate'

/** Drawn size of a corner handle, in screen pixels. */
export const HANDLE_SIZE_PX = 8
/** How far above the top edge the rotate handle sits, in screen pixels. */
export const ROTATE_OFFSET_PX = 24
/** Pointer slop around a handle centre, in screen pixels. */
export const HANDLE_HIT_PX = 6

export const CORNER_HANDLES: readonly CornerHandle[] = ['nw', 'ne', 'sw', 'se']

/** Handle centres in canvas points. `ptsPerPixel` converts screen pixels to
 * canvas points, so handles keep their size on screen at any zoom. */
export const handlePositions = (box: BBox, ptsPerPixel: number): Record<HandleId, Point> => {
  const right = box.x + box.width
  const bottom = box.y + box.height
  return {
    nw: { x: box.x, y: box.y },
    ne: { x: right, y: box.y },
    sw: { x: box.x, y: bottom },
    se: { x: right, y: bottom },
    rotate: { x: box.x + box.width / 2, y: box.y - ROTATE_OFFSET_PX * ptsPerPixel },
  }
}

/** The handle under `point`, rotate first so it wins over a nearby corner. */
export const hitHandle = (box: BBox, point: Point, ptsPerPixel: number): HandleId | null => {
  const positions = handlePositions(box, ptsPerPixel)
  const radius = HANDLE_HIT_PX * ptsPerPixel
  const order: HandleId[] = ['rotate', ...CORNER_HANDLES]
  for (const id of order) {
    const p = positions[id]
    if (Math.hypot(point.x - p.x, point.y - p.y) <= radius) return id
  }
  return null
}

/** CSS cursor for a handle. */
export const handleCursor = (id: HandleId): string => {
  if (id === 'rotate') return 'grab'
  return id === 'nw' || id === 'se' ? 'nwse-resize' : 'nesw-resize'
}
