/** Public renderer contract. Framework-free: the UI owns the canvas element. */
import type { Color, IconDoc, Platform, Rendition } from '../model/types'

/** Backdrop the icon is previewed against. */
export type Wallpaper = 'light' | 'dark' | 'gradient-blue' | 'gradient-warm' | 'checker'

export type RenderOptions = {
  rendition: Rendition
  platform: Platform
  wallpaper: Wallpaper
  /** degrees, 0 = light from top, clockwise */
  lightAngle: number
  tint: Color
  pixelRatio: number
  /** A transform gesture is running. A layer whose raster at its current transform
   * is missing is drawn from an older one and not rasterized again until the gesture
   * ends, so a drag never queues one rasterization per pointer move. Omitted means
   * false. */
  gesture?: boolean
}

export type Renderer = {
  kind: 'gl' | 'flat'
  render(doc: IconDoc, options: RenderOptions): void
  toBlob(doc: IconDoc, options: RenderOptions, size: number): Promise<Blob>
  resize(cssWidth: number, cssHeight: number): void
  dispose(): void
}
