import type { IconDoc, Platform } from '../model/types'
import { CANVAS_SIZE } from '../model/types'
import { combinedSvg } from './combined-svg'

/** Turns an SVG document into a square PNG blob. Injectable so callers (and
 * tests) can substitute a non-browser rasterizer. */
export type Rasterize = (svg: string, size: number) => Promise<Blob>

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the SVG for rasterization'))
    image.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))),
      'image/png',
    )
  })

/** Browser rasterizer: blob URL -> `<img>` -> canvas -> PNG blob. */
export const rasterizeSvg: Rasterize = async (svg, size) => {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = await loadImage(url)
    if (typeof OffscreenCanvas !== 'undefined') {
      const offscreen = new OffscreenCanvas(size, size)
      const ctx = offscreen.getContext('2d')
      if (!ctx) throw new Error('Could not get a 2D canvas context')
      ctx.drawImage(image, 0, 0, size, size)
      return await offscreen.convertToBlob({ type: 'image/png' })
    }
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not get a 2D canvas context')
    ctx.drawImage(image, 0, 0, size, size)
    return await canvasToBlob(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** The whole icon flattened to a single PNG, background included and no glass.
 * With a `platform`, the result is clipped to that platform's icon silhouette —
 * the same shape the renderer's approximate-glass PNG comes out as. */
export const flatPng = (
  doc: IconDoc,
  size = CANVAS_SIZE,
  opts: { platform?: Platform; rasterize?: Rasterize } = {},
): Promise<Blob> => {
  const rasterize = opts.rasterize ?? rasterizeSvg
  return rasterize(combinedSvg(doc, { background: true, platform: opts.platform }), size)
}
