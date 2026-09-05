import type { BlendMode, Fill, Group, IconDoc, Layer, LayerOverride } from '../model/types'
import { linearGradientVector } from '../render/gradient'
import { serializeColor } from './color'

/** A generated `icon.json` document. */
export type IconJson = Record<string, unknown>

type JsonObject = Record<string, unknown>

/** One entry of a `*-specializations` array. */
type Specialization = { appearance?: 'dark' | 'tinted'; value: unknown }

/** Icon Composer's `blend-mode` enum is a subset of our `BlendMode` union;
 * anything outside it is dropped rather than written and rejected. */
const ICON_JSON_BLEND_MODES = new Set<BlendMode>([
  'normal',
  'darken',
  'multiply',
  'plus-darker',
  'lighten',
  'screen',
  'plus-lighter',
  'overlay',
  'soft-light',
  'hard-light',
])

/** Our appearance overrides, in the order Icon Composer lists them. */
const OVERRIDE_SLOTS: readonly ['dark' | 'mono', 'dark' | 'tinted'][] = [
  ['dark', 'dark'],
  ['mono', 'tinted'],
]

const DISALLOWED_NAME_CHARS = /[^A-Za-z0-9 _.-]/g

/** Trim, replace characters outside `[A-Za-z0-9 _.-]` with `-`, collapse runs of
 * `-`, drop leading and trailing `-`, and fall back to `fallback` when nothing
 * meaningful is left (a name of pure punctuation sanitizes down to nothing). */
export const sanitizeName = (name: string, fallback: string): string => {
  const cleaned = name
    .trim()
    .replace(DISALLOWED_NAME_CHARS, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim()
  return cleaned === '' ? fallback : cleaned
}

/** `layerId -> asset file name`, in document order. Names are deduplicated with
 * a ` 2`, ` 3`, … suffix, case-insensitively so they cannot collide on a
 * case-insensitive filesystem. */
export const assetNames = (doc: IconDoc, format: 'svg' | 'png'): Map<string, string> => {
  const names = new Map<string, string>()
  const used = new Set<string>()
  for (const group of doc.groups) {
    for (const layer of group.layers) {
      const base = sanitizeName(layer.name, 'Layer')
      let candidate = base
      let n = 2
      while (used.has(candidate.toLowerCase())) {
        candidate = `${base} ${n}`
        n += 1
      }
      used.add(candidate.toLowerCase())
      names.set(layer.id, `${candidate}.${format}`)
    }
  }
  return names
}

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5

/** The schema's `orientation`: the gradient's start and stop points in normalized
 * canvas coordinates, the same vector the renderer and the combined SVG use. */
const gradientOrientation = (angle: number): JsonObject => {
  const { x1, y1, x2, y2 } = linearGradientVector(angle)
  return { start: { x: round5(x1), y: round5(y1) }, stop: { x: round5(x2), y: round5(y2) } }
}

/** A `Fill` as an icon.json fill object, or null for `none` (omit the key). */
export const fillToJson = (f: Fill): JsonObject | null => {
  switch (f.kind) {
    case 'none':
      return null
    case 'solid':
      return { solid: serializeColor(f.color) }
    case 'automatic-gradient':
      return { 'automatic-gradient': serializeColor(f.color) }
    case 'linear-gradient': {
      const json: JsonObject = { 'linear-gradient': f.colors.map(serializeColor) }
      // 0 degrees (bottom -> top) is Icon Composer's implicit orientation.
      if (f.angle % 360 !== 0) json.orientation = gradientOrientation(f.angle)
      return json
    }
  }
}

/** A fill as a specialization value: the `none` / `automatic` keywords are legal
 * there, where an omitted key is not. */
const fillSpecializationValue = (f: Fill | undefined): unknown =>
  f === undefined ? 'automatic' : (fillToJson(f) ?? 'none')

/** Build a `*-specializations` array (base entry first) when any appearance
 * overrides `pick`, else null. */
const specializations = <T>(
  overrides: Layer['overrides'],
  base: T,
  pick: (o: LayerOverride) => T | undefined,
  encode: (v: T | undefined) => unknown = (v) => v,
): Specialization[] | null => {
  const entries: Specialization[] = []
  for (const [slot, appearance] of OVERRIDE_SLOTS) {
    const override = overrides[slot]
    const value = override && pick(override)
    if (value !== undefined) entries.push({ appearance, value: encode(value) })
  }
  if (entries.length === 0) return null
  return [{ value: encode(base) }, ...entries]
}

const clampUnit = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

const layerToJson = (layer: Layer, imageName: string): JsonObject => {
  const json: JsonObject = { name: layer.name, 'image-name': imageName, glass: layer.glass }

  const fills = specializations<Fill | undefined>(
    layer.overrides,
    undefined,
    (o) => o.fill,
    fillSpecializationValue,
  )
  if (fills) json['fill-specializations'] = fills

  const opacity = specializations(
    layer.overrides,
    layer.opacity,
    (o) => o.opacity,
    (v) => clampUnit(v ?? 1),
  )
  if (opacity) json['opacity-specializations'] = opacity
  else if (layer.opacity !== 1) json.opacity = clampUnit(layer.opacity)

  const hidden = specializations(layer.overrides, layer.hidden, (o) => o.hidden)
  if (hidden) json['hidden-specializations'] = hidden
  else if (layer.hidden) json.hidden = true

  const blend = specializations(layer.overrides, layer.blendMode, (o) => o.blendMode)
  if (blend) {
    const supported = blend.filter((e) => ICON_JSON_BLEND_MODES.has(e.value as BlendMode))
    if (supported.length > 0) json['blend-mode-specializations'] = supported
  } else if (layer.blendMode !== 'normal' && ICON_JSON_BLEND_MODES.has(layer.blendMode)) {
    json['blend-mode'] = layer.blendMode
  }

  // `position` is never written: layer transforms are baked into the asset.
  return json
}

const groupToJson = (group: Group, names: Map<string, string>): JsonObject => {
  const { glass } = group
  const json: JsonObject = {
    name: group.name,
    layers: group.layers.map((l) => layerToJson(l, names.get(l.id) ?? '')),
    lighting: glass.lighting,
    specular: glass.specular,
    'blur-material': glass.blurMaterial,
    // Icon Composer 1.x reads the legacy `blur`; keep both in sync.
    blur: glass.blurMaterial,
    translucency: { enabled: glass.translucency.enabled, value: glass.translucency.value },
    shadow: { kind: glass.shadow.kind, opacity: glass.shadow.opacity },
  }
  if (group.opacity !== 1) json.opacity = clampUnit(group.opacity)
  if (group.blendMode !== 'normal' && ICON_JSON_BLEND_MODES.has(group.blendMode)) {
    json['blend-mode'] = group.blendMode
  }
  if (group.hidden) json.hidden = true
  if (glass.refractivity) {
    json.refractivity = {
      enabled: glass.refractivity.enabled,
      strength: glass.refractivity.strength,
      depth: glass.refractivity.depth,
    }
  }
  if (glass.specularPlacement) json['specular-highlight-placement'] = glass.specularPlacement
  return json
}

/** Icon Composer 2 feature gates. A document using either key must declare it,
 * so Icon Composer 1.x refuses it rather than silently dropping the effect. */
const documentFeatures = (groups: Group[]): string[] => {
  const features = new Set<string>()
  for (const group of groups) {
    if (group.glass.refractivity) features.add('refractivity')
    if (group.glass.specularPlacement) features.add('specular-location')
  }
  return [...features].sort()
}

/** Map an `IconDoc` onto the icon.json shape. Groups and layers keep document
 * order (top-most first), which is the order icon.json itself uses. Groups with
 * no layers are dropped — Icon Composer requires at least one. */
export const toIconJson = (doc: IconDoc, names: Map<string, string>): IconJson => {
  const groups = doc.groups.filter((g) => g.layers.length > 0)
  const json: IconJson = {}

  const features = documentFeatures(groups)
  if (features.length > 0) json.features = features

  const base = fillToJson(doc.fill.default)
  if (doc.fill.dark) {
    json['fill-specializations'] = [
      { value: base ?? 'none' },
      { appearance: 'dark', value: fillToJson(doc.fill.dark) ?? 'none' },
    ]
  } else if (base) {
    json.fill = base
  }

  json.groups = groups.map((g) => groupToJson(g, names))
  json['supported-platforms'] = doc.watchOS
    ? { squares: 'shared', circles: ['watchOS'] }
    : { squares: 'shared' }
  return json
}

/** Recursively sort object keys; array order is meaningful and preserved. */
export const sortKeysDeep = <T>(v: T): T => {
  if (Array.isArray(v)) return v.map(sortKeysDeep) as T
  if (v === null || typeof v !== 'object') return v
  const source = v as JsonObject
  const out: JsonObject = {}
  for (const key of Object.keys(source).sort()) out[key] = sortKeysDeep(source[key])
  return out as T
}

/** Sorted keys, 2-space indent, trailing newline — matching Icon Composer. */
export const serializeIconJson = (json: IconJson): string =>
  `${JSON.stringify(sortKeysDeep(json), null, 2)}\n`

export const iconJsonString = (doc: IconDoc, format: 'svg' | 'png'): string =>
  serializeIconJson(toIconJson(doc, assetNames(doc, format)))
