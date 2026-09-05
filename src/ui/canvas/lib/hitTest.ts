/** Which layer is under a canvas point. */
import { layerCanvasBBox } from '@/core/model/geometry'
import type { IconDoc, Layer } from '@/core/model/types'
import { containsPoint, type Point } from './bbox'

/**
 * The top-most visible layer whose canvas bounding box contains `point`, or null.
 * `doc.groups` and `group.layers` are top-most first, so plain iteration order
 * is already painting order reversed.
 */
export const hitTest = (doc: IconDoc, point: Point): Layer | null => {
  for (const group of doc.groups) {
    if (group.hidden) continue
    for (const layer of group.layers) {
      if (layer.hidden) continue
      if (containsPoint(layerCanvasBBox(layer), point)) return layer
    }
  }
  return null
}
