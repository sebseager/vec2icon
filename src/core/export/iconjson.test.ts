import Ajv2020, { type ErrorObject } from 'ajv/dist/2020'
import { beforeAll, describe, expect, it } from 'vitest'
import { createGroup, createLayer, emptyDoc } from '../model/defaults'
import type { Color, Fill, Group, IconDoc, Layer } from '../model/types'
import schema from './__fixtures__/icon-schema.json'
import type { IconJson } from './iconjson'
import {
  assetNames,
  fillToJson,
  iconJsonString,
  serializeIconJson,
  sortKeysDeep,
  toIconJson,
} from './iconjson'

const srgb = (r: number, g: number, b: number, a = 1): Color => ({
  space: 'srgb',
  components: [r, g, b, a],
})
const solid = (c: Color): Fill => ({ kind: 'solid', color: c })

const layer = (name: string, init: Partial<Layer> = {}): Layer =>
  createLayer({
    name,
    svg: `<g><title>${name}</title></g>`,
    defs: '',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 0, y: 0, width: 100, height: 100 },
    ...init,
  })

/** Two groups, overrides on both appearances, IC2 glass fields on the top group. */
const richDoc = (): IconDoc => {
  const top: Group = {
    ...createGroup('Foreground', [
      layer('Shape', {
        opacity: 0.5,
        blendMode: 'multiply',
        overrides: {
          dark: { fill: solid(srgb(1, 1, 1)), opacity: 0.8 },
          mono: { fill: { kind: 'none' }, hidden: true },
        },
      }),
      layer('Shape'),
    ]),
    opacity: 0.75,
    blendMode: 'screen',
  }
  top.glass = {
    ...top.glass,
    lighting: 'combined',
    specular: false,
    specularPlacement: 'outside',
    blurMaterial: 0.25,
    refractivity: { enabled: true, strength: 0.6, depth: 0.4 },
  }
  const bottom = createGroup('Background', [layer('Back/Plate*'), layer('')])
  bottom.hidden = true
  return {
    ...emptyDoc('My Icon'),
    fill: {
      default: { kind: 'automatic-gradient', color: srgb(0, 0.53333, 1) },
      dark: solid(srgb(0, 0, 0)),
    },
    watchOS: true,
    groups: [top, bottom],
  }
}

type JsonObject = Record<string, unknown>

/** `json.groups`, typed for assertions. */
const groupsOf = (json: IconJson): JsonObject[] => json.groups as JsonObject[]

/** The layers of the nth group of `json`. */
const layersOf = (json: IconJson, groupIndex = 0): JsonObject[] =>
  (groupsOf(json)[groupIndex]?.layers ?? []) as JsonObject[]

let validate: ReturnType<Ajv2020['compile']>

beforeAll(() => {
  validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema)
})

const expectValid = (json: unknown): void => {
  const ok = validate(json)
  if (!ok) {
    const errors = (validate.errors ?? []) as ErrorObject[]
    throw new Error(
      `icon.json failed schema validation:\n${errors
        .map((e) => `  ${e.instancePath || '/'} ${e.message} ${JSON.stringify(e.params)}`)
        .join('\n')}`,
    )
  }
  expect(ok).toBe(true)
}

describe('assetNames', () => {
  it('sanitizes, dedupes and appends the format extension', () => {
    const doc = richDoc()
    const names = [...assetNames(doc, 'svg').values()]
    expect(names).toEqual(['Shape.svg', 'Shape 2.svg', 'Back-Plate.svg', 'Layer.svg'])
  })

  it('uses the png extension for png assets', () => {
    const doc = richDoc()
    expect([...assetNames(doc, 'png').values()][0]).toBe('Shape.png')
  })

  it('is keyed by layer id', () => {
    const doc = richDoc()
    const names = assetNames(doc, 'svg')
    const first = doc.groups[0]?.layers[0]
    expect(first && names.get(first.id)).toBe('Shape.svg')
  })

  it('falls back when a name sanitizes down to punctuation only', () => {
    const doc = {
      ...emptyDoc(),
      groups: [createGroup('G', [layer('***'), layer('- -'), layer('.')])],
    }
    expect([...assetNames(doc, 'svg').values()]).toEqual(['Layer.svg', 'Layer 2.svg', '..svg'])
  })

  it('dedupes case-insensitively so macOS cannot collide the files', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G', [layer('shape'), layer('SHAPE')])] }
    expect([...assetNames(doc, 'svg').values()]).toEqual(['shape.svg', 'SHAPE 2.svg'])
  })
})

describe('fillToJson', () => {
  it('maps none to null so the key is omitted', () => {
    expect(fillToJson({ kind: 'none' })).toBeNull()
  })

  it('maps solid and automatic-gradient to a single serialized color', () => {
    expect(fillToJson(solid(srgb(1, 0, 0)))).toEqual({
      solid: 'extended-srgb:1.00000,0.00000,0.00000,1.00000',
    })
    expect(fillToJson({ kind: 'automatic-gradient', color: srgb(0, 0.53333, 1) })).toEqual({
      'automatic-gradient': 'extended-srgb:0.00000,0.53333,1.00000,1.00000',
    })
  })

  it('maps a 0-degree linear gradient to a bare two-color array', () => {
    expect(
      fillToJson({ kind: 'linear-gradient', colors: [srgb(0, 0, 0), srgb(1, 1, 1)], angle: 0 }),
    ).toEqual({
      'linear-gradient': [
        'extended-srgb:0.00000,0.00000,0.00000,1.00000',
        'extended-srgb:1.00000,1.00000,1.00000,1.00000',
      ],
    })
  })

  it('adds schema orientation points for a rotated gradient (90 = left to right)', () => {
    const json = fillToJson({
      kind: 'linear-gradient',
      colors: [srgb(0, 0, 0), srgb(1, 1, 1)],
      angle: 90,
    })
    expect(json?.orientation).toEqual({ start: { x: 0, y: 0.5 }, stop: { x: 1, y: 0.5 } })
  })
})

describe('sortKeysDeep', () => {
  it('sorts object keys at every level and leaves array order alone', () => {
    const sorted = sortKeysDeep({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 3 } })
    expect(Object.keys(sorted)).toEqual(['a', 'b'])
    expect(Object.keys(sorted.a)).toEqual(['c', 'd'])
    expect(Object.keys(sorted.a.d[0] as object)).toEqual(['y', 'z'])
    expect(sortKeysDeep([3, 1, 2])).toEqual([3, 1, 2])
  })
})

describe('serializeIconJson', () => {
  it('emits sorted keys, 2-space indent and a trailing newline', () => {
    const text = serializeIconJson({ b: 1, a: 2 })
    expect(text).toBe('{\n  "a": 2,\n  "b": 1\n}\n')
  })
})

describe('toIconJson', () => {
  const build = (doc: IconDoc) => toIconJson(doc, assetNames(doc, 'svg'))

  it('validates against the Icon Composer schema', () => {
    expectValid(build(richDoc()))
  })

  it('(negative control) the compiled schema really does reject bad documents', () => {
    // Guards the test above from passing vacuously.
    expect(validate({ groups: [], 'supported-platforms': { squares: 'shared' } })).toBe(true)
    expect(validate({})).toBe(false)
    expect(
      validate({ groups: [{ layers: [] }], 'supported-platforms': { squares: 'shared' } }),
    ).toBe(false)
    expect(validate({ ...build(richDoc()), features: undefined })).toBe(false)
    expect(validate({ ...build(richDoc()), 'made-up-key': 1 })).toBe(false)
    const bad = build(richDoc()) as Record<string, unknown>
    ;(groupsOf(bad as IconJson)[0] as JsonObject)['blend-mode'] = 'luminosity'
    expect(validate(bad)).toBe(false)
  })

  it('validates a minimal single-group document', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G', [layer('A')])] }
    expectValid(build(doc))
  })

  it('serializes with keys sorted at every level', () => {
    const json = JSON.parse(iconJsonString(richDoc(), 'svg')) as Record<string, unknown>
    const keysSorted = (v: unknown): void => {
      if (Array.isArray(v)) return void v.forEach(keysSorted)
      if (v && typeof v === 'object') {
        const keys = Object.keys(v)
        expect(keys).toEqual([...keys].sort())
        Object.values(v).forEach(keysSorted)
      }
    }
    keysSorted(json)
  })

  it('lists watchOS circles only when enabled', () => {
    expect(build(richDoc())['supported-platforms']).toEqual({
      squares: 'shared',
      circles: ['watchOS'],
    })
    expect(build({ ...richDoc(), watchOS: false })['supported-platforms']).toEqual({
      squares: 'shared',
    })
  })

  it('writes fill-specializations when a dark document fill exists, plain fill otherwise', () => {
    const withDark = build(richDoc())
    expect(withDark.fill).toBeUndefined()
    expect(withDark['fill-specializations']).toEqual([
      { value: { 'automatic-gradient': 'extended-srgb:0.00000,0.53333,1.00000,1.00000' } },
      { appearance: 'dark', value: { solid: 'extended-srgb:0.00000,0.00000,0.00000,1.00000' } },
    ])

    const doc = richDoc()
    doc.fill = { default: solid(srgb(1, 1, 1)) }
    const plain = build(doc)
    expect(plain.fill).toEqual({ solid: 'extended-srgb:1.00000,1.00000,1.00000,1.00000' })
    expect(plain['fill-specializations']).toBeUndefined()
  })

  it('writes blur-material and the legacy blur with the same value', () => {
    const group = groupsOf(build(richDoc()))[0]
    expect(group?.['blur-material']).toBe(0.25)
    expect(group?.blur).toBe(0.25)
  })

  it('writes group glass properties and non-default composition keys', () => {
    const [top, bottom] = groupsOf(build(richDoc()))
    expect(top).toMatchObject({
      name: 'Foreground',
      lighting: 'combined',
      specular: false,
      translucency: { enabled: true, value: 0.5 },
      shadow: { kind: 'neutral', opacity: 0.5 },
      opacity: 0.75,
      'blend-mode': 'screen',
      refractivity: { enabled: true, strength: 0.6, depth: 0.4 },
      'specular-highlight-placement': 'outside',
    })
    expect(top?.hidden).toBeUndefined()
    expect(bottom?.hidden).toBe(true)
    expect(bottom?.opacity).toBeUndefined()
    expect(bottom?.['blend-mode']).toBeUndefined()
    expect(bottom?.refractivity).toBeUndefined()
    expect(bottom?.['specular-highlight-placement']).toBeUndefined()
  })

  it('declares only the IC2 features actually used, sorted', () => {
    expect(build(richDoc()).features).toEqual(['refractivity', 'specular-location'])

    const doc = richDoc()
    const top = doc.groups[0]
    if (top) top.glass = { ...top.glass, refractivity: undefined }
    expect(build(doc).features).toEqual(['specular-location'])

    const plain = { ...emptyDoc(), groups: [createGroup('G', [layer('A')])] }
    expect(build(plain).features).toBeUndefined()
  })

  it('writes layers in document order with name, image-name and glass', () => {
    const layers = layersOf(build(richDoc()))
    expect(layers.map((l) => l.name)).toEqual(['Shape', 'Shape'])
    expect(layers.map((l) => l['image-name'])).toEqual(['Shape.svg', 'Shape 2.svg'])
    expect(layers[0]?.glass).toBe(true)
  })

  it('omits default layer opacity, blend-mode and hidden', () => {
    const plain = layersOf(build(richDoc()))
    expect(plain[1]).toEqual({ name: 'Shape', 'image-name': 'Shape 2.svg', glass: true })
  })

  it('turns overrides into specializations arrays instead of the plain key', () => {
    const first = layersOf(build(richDoc()))[0]
    expect(first?.opacity).toBeUndefined()
    expect(first?.['opacity-specializations']).toEqual([
      { value: 0.5 },
      { appearance: 'dark', value: 0.8 },
    ])
    expect(first?.['blend-mode']).toBe('multiply')
    expect(first?.['hidden-specializations']).toEqual([
      { value: false },
      { appearance: 'tinted', value: true },
    ])
    expect(first?.['fill-specializations']).toEqual([
      { value: 'automatic' },
      { appearance: 'dark', value: { solid: 'extended-srgb:1.00000,1.00000,1.00000,1.00000' } },
      { appearance: 'tinted', value: 'none' },
    ])
  })

  it('never writes position — layer transforms are baked into the asset', () => {
    const doc = richDoc()
    const first = doc.groups[0]?.layers[0]
    if (first) first.transform = { x: 100, y: 50, scaleX: 2, scaleY: 2, rotation: 30 }
    expect(iconJsonString(doc, 'svg')).not.toContain('position')
  })

  it('omits blend modes the Icon Composer schema does not define', () => {
    const doc = richDoc()
    const first = doc.groups[0]?.layers[0]
    if (first) first.blendMode = 'luminosity'
    const json = build(doc)
    const l = layersOf(json)[0]
    expect(l?.['blend-mode']).toBeUndefined()
    expectValid(json)
  })

  it('drops groups with no layers, which the schema forbids', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('Empty'), createGroup('G', [layer('A')])] }
    const json = build(doc)
    expect((json.groups as unknown[]).length).toBe(1)
    expectValid(json)
  })

  it('exports hidden layers rather than skipping them', () => {
    const doc = { ...emptyDoc(), groups: [createGroup('G', [layer('A', { hidden: true })])] }
    const l = layersOf(build(doc))[0]
    expect(l?.hidden).toBe(true)
  })

  it('references exactly the asset names it was given', () => {
    const doc = richDoc()
    const names = assetNames(doc, 'svg')
    const json = toIconJson(doc, names)
    const referenced = new Set<string>()
    for (const group of groupsOf(json)) {
      for (const l of group.layers as JsonObject[]) {
        referenced.add(l['image-name'] as string)
      }
    }
    expect([...referenced].sort()).toEqual([...names.values()].sort())
  })
})
