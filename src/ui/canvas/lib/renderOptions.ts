/** The view state, as the renderer wants it. */
import type { RenderOptions } from '@/core/render'
import type { View } from '@/state'

export const devicePixelRatioOf = (): number => {
  const ratio = globalThis.devicePixelRatio
  return typeof ratio === 'number' && ratio > 0 ? ratio : 1
}

export const renderOptionsFromView = (
  view: View,
  pixelRatio = devicePixelRatioOf(),
): RenderOptions => ({
  rendition: view.rendition,
  platform: view.platform,
  wallpaper: view.wallpaper,
  lightAngle: view.lightAngle,
  tint: view.tint,
  pixelRatio,
})
