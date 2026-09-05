import type { Glass, Group, IconDoc, Layer, Transform } from './types'

export const newId = (): string => crypto.randomUUID()

export const identityTransform = (): Transform => ({
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
})

export const defaultGlass = (): Glass => ({
  lighting: 'individual',
  specular: true,
  blurMaterial: 0.5,
  translucency: { enabled: true, value: 0.5 },
  shadow: { kind: 'neutral', opacity: 0.5 },
})

export const createLayer = (
  init: Pick<Layer, 'name' | 'svg' | 'defs' | 'sourceViewBox' | 'bbox'> & Partial<Layer>,
): Layer => ({
  id: newId(),
  transform: identityTransform(),
  opacity: 1,
  blendMode: 'normal',
  glass: true,
  hidden: false,
  overrides: {},
  issues: [],
  ...init,
})

export const createGroup = (name: string, layers: Layer[] = []): Group => ({
  id: newId(),
  name,
  layers,
  glass: defaultGlass(),
  opacity: 1,
  blendMode: 'normal',
  hidden: false,
})

export const emptyDoc = (name = 'Icon'): IconDoc => ({
  name,
  fill: { default: { kind: 'solid', color: { space: 'srgb', components: [1, 1, 1, 1] } } },
  watchOS: false,
  groups: [],
})

export const isIdentityTransform = (t: Transform): boolean =>
  t.x === 0 && t.y === 0 && t.scaleX === 1 && t.scaleY === 1 && t.rotation === 0
