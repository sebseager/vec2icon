/** The bundled example: a small scene that touches every feature the editor has —
 * nested-svg groups, gradients, strokes, opacity, per-group glass settings, appearance
 * overrides, transforms, a gradient document fill and watchOS. Tests use it too. */
import { emptyDoc } from '@/core/model/defaults'
import {
  addGroups,
  allLayers,
  setDocFill,
  setGlass,
  setLayerOverride,
  setTransform,
  setWatchOS,
  updateGroup,
  updateLayer,
} from '@/core/model/ops'
import type { Group, IconDoc, Layer } from '@/core/model/types'
import { importSvgFiles, type Measurer } from '@/core/svg'
import sunsetSvg from './sunset.svg?raw'

export const EXAMPLE_NAME = 'Sunset'
export const EXAMPLE_FILE = 'sunset.svg'

const srgb = (r: number, g: number, b: number, a = 1) => ({
  space: 'srgb' as const,
  components: [r, g, b, a],
})

const layerNamed = (doc: IconDoc, name: string): Layer => {
  const layer = allLayers(doc).find((l) => l.name === name)
  if (!layer) throw new Error(`Example is missing the "${name}" layer`)
  return layer
}

const groupNamed = (doc: IconDoc, name: string): Group => {
  const group = doc.groups.find((g) => g.name === name)
  if (!group) throw new Error(`Example is missing the "${name}" group`)
  return group
}

/** The example document, built through the same import path a dropped file takes. */
export const loadExampleDoc = async (opts?: { measurer?: Measurer }): Promise<IconDoc> => {
  const { groups, rejected } = await importSvgFiles([{ name: EXAMPLE_FILE, data: sunsetSvg }], opts)
  const refusal = rejected[0]
  if (refusal) throw new Error(`Example could not be imported: ${refusal.reason}`)

  let doc = addGroups(emptyDoc(EXAMPLE_NAME), groups, 0)

  // Document: a warm gradient by day, a deep solid by night, and the watch shape too.
  doc = setDocFill(doc, 'default', {
    kind: 'linear-gradient',
    colors: [srgb(0.99, 0.6, 0.34), srgb(1, 0.82, 0.58)],
    angle: 0,
  })
  doc = setDocFill(doc, 'dark', { kind: 'solid', color: srgb(0.1, 0.14, 0.49) })
  doc = setWatchOS(doc, true)

  // The sun is one piece of glass that bends what sits behind it.
  const sun = groupNamed(doc, 'Sun')
  doc = setGlass(doc, sun.id, {
    lighting: 'combined',
    specularPlacement: 'outside',
    blurMaterial: 0.35,
    refractivity: { enabled: true, strength: 0.6, depth: 0.4 },
    shadow: { kind: 'layer-color', opacity: 0.4 },
  })

  // The scenery keeps a lighter touch.
  const scene = groupNamed(doc, 'sunset')
  doc = updateGroup(doc, scene.id, { name: 'Scene' })
  doc = setGlass(doc, scene.id, { blurMaterial: 0.25, translucency: { enabled: true, value: 0.3 } })

  // Per-layer knobs: opacity, blend, flat artwork, transforms and appearance overrides.
  doc = updateLayer(doc, layerNamed(doc, 'Cloud').id, { opacity: 0.85, blendMode: 'screen' })
  doc = setLayerOverride(doc, layerNamed(doc, 'Cloud').id, 'mono', {
    fill: { kind: 'solid', color: { space: 'gray', components: [1, 0.8] } },
  })
  doc = updateLayer(doc, layerNamed(doc, 'Star').id, { glass: false })
  doc = setTransform(doc, layerNamed(doc, 'Star').id, { scaleX: 0.8, scaleY: 0.8, rotation: 12 })
  doc = setLayerOverride(doc, layerNamed(doc, 'Bird').id, 'dark', {
    fill: { kind: 'solid', color: srgb(1, 1, 1) },
  })
  doc = setTransform(doc, layerNamed(doc, 'Bird').id, { x: -30, y: -20, rotation: -8 })

  return doc
}
