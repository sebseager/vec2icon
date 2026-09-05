/** How each rendition maps onto appearances, plates and the tint. Pure. */
import type { Appearance, Rendition } from '../model/types'

/** The translucent backing the Clear and Tinted renditions draw behind the art. */
export type Plate = 'none' | 'clear-light' | 'clear-dark' | 'tinted-light' | 'tinted-dark'

export type RenditionPlan = {
  appearance: Appearance
  plate: Plate
  /** Whether the document fill paints the background (Clear/Tinted show the wallpaper). */
  usesDocFill: boolean
  usesTint: boolean
  /** Whether layers are painted from their Mono luminance rather than their own colors. */
  monoFromLuminance: boolean
}

const PLANS: Record<Rendition, RenditionPlan> = {
  default: {
    appearance: 'default',
    plate: 'none',
    usesDocFill: true,
    usesTint: false,
    monoFromLuminance: false,
  },
  dark: {
    appearance: 'dark',
    plate: 'none',
    usesDocFill: true,
    usesTint: false,
    monoFromLuminance: false,
  },
  clearLight: {
    appearance: 'mono',
    plate: 'clear-light',
    usesDocFill: false,
    usesTint: false,
    monoFromLuminance: true,
  },
  clearDark: {
    appearance: 'mono',
    plate: 'clear-dark',
    usesDocFill: false,
    usesTint: false,
    monoFromLuminance: true,
  },
  tintedLight: {
    appearance: 'mono',
    plate: 'tinted-light',
    usesDocFill: false,
    usesTint: true,
    monoFromLuminance: true,
  },
  tintedDark: {
    appearance: 'mono',
    plate: 'tinted-dark',
    usesDocFill: false,
    usesTint: true,
    monoFromLuminance: true,
  },
}

export const renditionPlan = (r: Rendition): RenditionPlan => PLANS[r]
