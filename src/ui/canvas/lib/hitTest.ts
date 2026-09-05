/** Which layer is under a canvas point. */
import { applyToPoint, invert, layerMatrix } from '@/core/model/geometry'
import type { IconDoc, Layer } from '@/core/model/types'
import { containsPoint, type Point } from './bbox'

/** Whether `point` falls inside the layer's own box, however it is placed or turned. */
export const layerContains = (
  layer: Pick<Layer, 'sourceViewBox' | 'bbox' | 'transform'>,
  point: Point,
): boolean => containsPoint(layer.bbox, applyToPoint(invert(layerMatrix(layer)), point))

/**
 * The top-most visible layer whose box contains `point`, or null.
 * `doc.groups` and `group.layers` are top-most first, so plain iteration order
 * is already painting order reversed.
 */
export const hitTest = (doc: IconDoc, point: Point): Layer | null => {
  for (const group of doc.groups) {
    if (group.hidden) continue
    for (const layer of group.layers) {
      if (layer.hidden) continue
      if (layerContains(layer, point)) return layer
    }
  }
  return null
}
