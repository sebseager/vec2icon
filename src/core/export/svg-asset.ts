import { layerMatrix, matrixToSvg } from '../model/geometry'
import type { Layer } from '../model/types'
import { CANVAS_SIZE } from '../model/types'

export { prefixIds } from '../svg/ids'

/** Standalone `Assets/*.svg` document for one layer: the full 1024 canvas with
 * the layer's source-units -> canvas matrix baked in. No fill override is
 * applied — Icon Composer derives the dark/tinted appearances itself. */
export const layerAssetSvg = (layer: Layer): string => {
  const defs = layer.defs ? `<defs>${layer.defs}</defs>` : ''
  const transform = matrixToSvg(layerMatrix(layer))
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">${defs}<g transform="${transform}">${layer.svg}</g></svg>`
}
