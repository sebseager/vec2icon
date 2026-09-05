/** Shared document model for vec2icon. Framework-free: no React, no state/ui imports. */

/** The three appearances a layer/group can override. */
export type Appearance = 'default' | 'dark' | 'mono'
export const APPEARANCES: readonly Appearance[] = ['default', 'dark', 'mono']

/** The six Icon Composer renditions rendered in preview / export. */
export type Rendition =
  | 'default'
  | 'dark'
  | 'clearLight'
  | 'clearDark'
  | 'tintedLight'
  | 'tintedDark'
export const RENDITIONS: readonly Rendition[] = [
  'default',
  'dark',
  'clearLight',
  'clearDark',
  'tintedLight',
  'tintedDark',
]

/** Target platforms an icon may ship on. */
export type Platform = 'ios' | 'macos' | 'watchos'

/** The icon canvas is always 1024 x 1024 points. */
export const CANVAS_SIZE = 1024

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'plus-darker'
  | 'plus-lighter'

export const BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
  'plus-darker',
  'plus-lighter',
]

/** A color in a given color space. Components are 0..1, alpha last. */
export type Color = { space: 'srgb' | 'display-p3' | 'gray'; components: number[] }

export type Fill =
  | { kind: 'none' }
  | { kind: 'solid'; color: Color }
  | { kind: 'automatic-gradient'; color: Color }
  | { kind: 'linear-gradient'; colors: [Color, Color]; angle: number } // degrees, 0 = bottom->top

/** x,y in canvas points relative to canvas center; scale multiplies the fitted import size; rotation degrees clockwise */
export type Transform = { x: number; y: number; scaleX: number; scaleY: number; rotation: number }

export type LayerOverride = {
  fill?: Fill
  opacity?: number
  hidden?: boolean
  blendMode?: BlendMode
}

export type IssueCode =
  | 'filter'
  | 'mask'
  | 'raster'
  | 'text'
  | 'invisible-rect'
  | 'background'
  | 'groups'
  | 'empty'

export type IssueFix = { id: string; label: string; warning?: string }

export type Issue = { code: IssueCode; message: string; help?: string; fixes: IssueFix[] }

export type BBox = { x: number; y: number; width: number; height: number }

export type ViewBox = [number, number, number, number]

export type Layer = {
  id: string
  name: string
  /** sanitized fragment: <g>...</g> in source user units */
  svg: string
  /** referenced <defs> children, transitive (inner HTML of a <defs>, no wrapper) */
  defs: string
  sourceViewBox: ViewBox
  /** in source user units */
  bbox: BBox
  transform: Transform
  opacity: number
  blendMode: BlendMode
  glass: boolean
  hidden: boolean
  overrides: Partial<Record<'dark' | 'mono', LayerOverride>>
  issues: Issue[]
}

export type Glass = {
  lighting: 'individual' | 'combined'
  specular: boolean
  /** IC2 only */
  specularPlacement?: 'automatic' | 'inside' | 'outside'
  blurMaterial: number
  /** IC2 only */
  refractivity?: { enabled: boolean; strength: number; depth: number }
  translucency: { enabled: boolean; value: number }
  shadow: { kind: 'neutral' | 'layer-color' | 'none'; opacity: number }
}

export type Group = {
  id: string
  name: string
  /** top-most first */
  layers: Layer[]
  glass: Glass
  opacity: number
  blendMode: BlendMode
  hidden: boolean
}

export type IconDoc = {
  name: string
  fill: { default: Fill; dark?: Fill }
  watchOS: boolean
  /** top-most first, same order as icon.json and the layers panel */
  groups: Group[]
}

/** Document-level issues (e.g. 'groups' > 4) are not attached to a layer. */
export type DocIssue = Issue
