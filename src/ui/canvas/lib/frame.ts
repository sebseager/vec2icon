/** The selection frame of a layer: its own box carried into canvas space, so it turns
 * with the artwork instead of growing into the axis-aligned bounds around it. */
import { applyToPoint, layerMatrix } from '@/core/model/geometry'
import type { BBox, Layer } from '@/core/model/types'
import type { Point } from './bbox'

export type CornerHandle = 'nw' | 'ne' | 'sw' | 'se'

export type Frame = {
  corners: Record<CornerHandle, Point>
  centre: Point
  /** Degrees clockwise the top edge is turned from horizontal. */
  angle: number
  /** Unit vector pointing out of the top edge, away from the centre. */
  up: Point
}

const DEG = 180 / Math.PI

const frameOf = (corners: Record<CornerHandle, Point>): Frame => {
  const { nw, ne, se } = corners
  const centre = { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 }
  const angle = Math.atan2(ne.y - nw.y, ne.x - nw.x) * DEG
  const midTop = { x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2 }
  const dx = midTop.x - centre.x
  const dy = midTop.y - centre.y
  const length = Math.hypot(dx, dy)
  // A box with no height has no "out of the top edge"; fall back to the turned up axis.
  const up =
    length > 0
      ? { x: dx / length, y: dy / length }
      : { x: Math.sin(angle / DEG), y: -Math.cos(angle / DEG) }
  return { corners, centre, angle, up }
}

/** An axis-aligned frame, for the hover outline and for tests. */
export const frameFromBBox = (b: BBox): Frame =>
  frameOf({
    nw: { x: b.x, y: b.y },
    ne: { x: b.x + b.width, y: b.y },
    sw: { x: b.x, y: b.y + b.height },
    se: { x: b.x + b.width, y: b.y + b.height },
  })

export const layerFrame = (layer: Pick<Layer, 'sourceViewBox' | 'bbox' | 'transform'>): Frame => {
  const m = layerMatrix(layer)
  const b = layer.bbox
  return frameOf({
    nw: applyToPoint(m, { x: b.x, y: b.y }),
    ne: applyToPoint(m, { x: b.x + b.width, y: b.y }),
    sw: applyToPoint(m, { x: b.x, y: b.y + b.height }),
    se: applyToPoint(m, { x: b.x + b.width, y: b.y + b.height }),
  })
}
