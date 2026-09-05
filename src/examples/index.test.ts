import Ajv2020 from 'ajv/dist/2020'
import { beforeAll, describe, expect, it } from 'vitest'
import schema from '@/core/export/__fixtures__/icon-schema.json'
import { assetNames, toIconJson } from '@/core/export/iconjson'
import { allLayers } from '@/core/model/ops'
import { lintDoc } from '@/core/svg'
import { EXAMPLE_NAME, loadExampleDoc } from './index'

let validate: ReturnType<Ajv2020['compile']>

beforeAll(() => {
  validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema)
})

describe('the bundled example', () => {
  it('imports as the scene and the sun, with every named layer', async () => {
    const doc = await loadExampleDoc()
    expect(doc.name).toBe(EXAMPLE_NAME)
    expect(doc.groups.map((g) => g.name)).toEqual(
      ['Scene', 'Sun'].sort((a, b) => {
        const order = doc.groups.map((g) => g.name)
        return order.indexOf(a) - order.indexOf(b)
      }),
    )
    expect(
      allLayers(doc)
        .map((l) => l.name)
        .sort(),
    ).toEqual(['Bird', 'Cloud', 'Disc', 'Hills', 'Rays', 'Star'].sort())
  })

  it('has nothing for the issues panel to say', async () => {
    const doc = await loadExampleDoc()
    expect(lintDoc(doc)).toEqual([])
    expect(allLayers(doc).flatMap((l) => l.issues)).toEqual([])
  })

  it('touches glass, overrides, transforms, the dark fill and watchOS', async () => {
    const doc = await loadExampleDoc()
    const sun = doc.groups.find((g) => g.name === 'Sun')
    expect(sun?.glass.refractivity?.enabled).toBe(true)
    expect(sun?.glass.specularPlacement).toBe('outside')
    const layers = allLayers(doc)
    expect(layers.some((l) => l.overrides.dark?.fill)).toBe(true)
    expect(layers.some((l) => l.overrides.mono?.fill)).toBe(true)
    expect(layers.some((l) => l.transform.rotation !== 0)).toBe(true)
    expect(layers.some((l) => !l.glass)).toBe(true)
    expect(layers.some((l) => l.blendMode !== 'normal')).toBe(true)
    expect(doc.fill.dark).toBeDefined()
    expect(doc.watchOS).toBe(true)
  })

  it('exports an icon.json the community schema accepts', async () => {
    const doc = await loadExampleDoc()
    const json = toIconJson(doc, assetNames(doc, 'svg'))
    const ok = validate(json)
    expect(validate.errors ?? []).toEqual([])
    expect(ok).toBe(true)
  })
})
