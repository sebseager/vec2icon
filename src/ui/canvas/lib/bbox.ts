/** Small bounding-box helpers shared by hit testing, snapping and the overlay. */
import type { BBox } from '@/core/model/types'

export type Point = { x: number; y: number }

/** Edges count as inside, so a click on the outline still picks the layer up. */
export const containsPoint = (box: BBox, p: Point): boolean =>
  p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height

export const bboxCenter = (box: BBox): Point => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

/** Smallest box covering all of `boxes`; null when there are none. */
export const unionBBox = (boxes: BBox[]): BBox | null => {
  const first = boxes[0]
  if (!first) return null
  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.width
  let maxY = first.y + first.height
  for (const box of boxes.slice(1)) {
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.width)
    maxY = Math.max(maxY, box.y + box.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
