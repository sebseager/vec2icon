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
}

export type Renderer = {
  kind: 'gl' | 'flat'
  render(doc: IconDoc, options: RenderOptions): void
  toBlob(doc: IconDoc, options: RenderOptions, size: number): Promise<Blob>
  resize(cssWidth: number, cssHeight: number): void
  dispose(): void
}
