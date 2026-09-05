/** Positions of the selection handles, and which one a pointer is over. */
import type { Point } from './bbox'
import type { CornerHandle, Frame } from './frame'

export type { CornerHandle } from './frame'
export type HandleId = CornerHandle | 'rotate'

/** Drawn size of a corner handle, in screen pixels. */
export const HANDLE_SIZE_PX = 8
/** How far out from the top edge the rotate handle sits, in screen pixels. */
export const ROTATE_OFFSET_PX = 24
/** Pointer slop around a handle centre, in screen pixels. */
export const HANDLE_HIT_PX = 6

export const CORNER_HANDLES: readonly CornerHandle[] = ['nw', 'ne', 'sw', 'se']

/** Handle centres in canvas points. `ptsPerPixel` converts screen pixels to
 * canvas points, so handles keep their size on screen at any zoom. */
export const handlePositions = (frame: Frame, ptsPerPixel: number): Record<HandleId, Point> => {
  const { nw, ne, sw, se } = frame.corners
  const offset = ROTATE_OFFSET_PX * ptsPerPixel
  return {
    nw,
    ne,
    sw,
    se,
    rotate: {
      x: (nw.x + ne.x) / 2 + frame.up.x * offset,
      y: (nw.y + ne.y) / 2 + frame.up.y * offset,
    },
  }
}

/** The handle under `point`, rotate first so it wins over a nearby corner. */
export const hitHandle = (frame: Frame, point: Point, ptsPerPixel: number): HandleId | null => {
  const positions = handlePositions(frame, ptsPerPixel)
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
