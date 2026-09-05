/** Keep freshly imported artwork inside the canvas: art that overhangs the 1024-point
 * square is scaled down to fit and centred, as one piece, so a big drawing is never
 * mostly out of frame. Art that already fits is left exactly where it was. */
import { applyToPoint, layerCanvasBBox, layerMatrix } from '../model/geometry'
import type { BBox, Layer } from '../model/types'
import { CANVAS_SIZE } from '../model/types'

const union = (boxes: BBox[]): BBox | null => {
  const first = boxes[0]
  if (!first) return null
  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.width
  let maxY = first.y + first.height
  for (const b of boxes.slice(1)) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

const withinCanvas = (b: BBox): boolean =>
  b.x >= 0 && b.y >= 0 && b.x + b.width <= CANVAS_SIZE && b.y + b.height <= CANVAS_SIZE

/** The point a layer scales and turns about, in canvas coordinates. */
const pivotOf = (layer: Layer): { x: number; y: number } =>
  applyToPoint(layerMatrix(layer), {
    x: layer.bbox.x + layer.bbox.width / 2,
    y: layer.bbox.y + layer.bbox.height / 2,
  })

/** `layers` moved and scaled together so their combined bounds sit inside the canvas.
 * Relative placement is preserved: every pivot is mapped by the same similarity. */
export const fitLayersToCanvas = (layers: Layer[]): Layer[] => {
  const bounds = union(layers.map(layerCanvasBBox))
  if (!bounds || withinCanvas(bounds)) return layers
  if (bounds.width === 0 && bounds.height === 0) return layers

  const s = Math.min(1, CANVAS_SIZE / bounds.width, CANVAS_SIZE / bounds.height)
  const from = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const half = CANVAS_SIZE / 2

  return layers.map((layer) => {
    const pivot = pivotOf(layer)
    const target = { x: half + s * (pivot.x - from.x), y: half + s * (pivot.y - from.y) }
    const t = layer.transform
    return {
      ...layer,
      transform: {
        ...t,
        x: t.x + (target.x - pivot.x),
        y: t.y + (target.y - pivot.y),
        scaleX: t.scaleX * s,
        scaleY: t.scaleY * s,
      },
    }
  })
}
