import { gzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { fixture } from './__fixtures__'
import type { ParseResult, StyleRule } from './index'
import { type ImportFile, importSvgFiles } from './index'

const file = (name: string): ImportFile => ({ name, data: fixture(name) })

const names = (layers: { name: string }[]) => layers.map((l) => l.name)

describe('importSvgFiles', () => {
  it('imports a Figma export as one group with one layer', async () => {
    const { groups, rejected } = await importSvgFiles([file('figma.svg')])
    expect(rejected).toEqual([])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('figma')
    expect(names(groups[0]?.layers ?? [])).toEqual(['Layer 1'])
    const layer = groups[0]?.layers[0]
    expect(layer?.sourceViewBox).toEqual([0, 0, 1024, 1024])
    expect(layer?.defs).toContain('id="paint0_linear_1_2"')
    expect(layer?.issues.map((i) => i.code)).toContain('mask')
    expect(layer?.transform).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
  })

  it('imports an Illustrator export top-most first with styles resolved', async () => {
    const { groups } = await importSvgFiles([file('illustrator.svg')])
    expect(names(groups[0]?.layers ?? [])).toEqual(['Layer 3', 'hero', 'Layer 1'])
    expect(groups[0]?.layers[1]?.svg).toContain('fill="#0f0"')
    expect(groups[0]?.layers[1]?.svg).not.toContain('class=')

    const bottom = groups[0]?.layers[2]
    expect(bottom?.svg).toContain('fill="url(#linear-gradient)"')
    const background = bottom?.issues.find((i) => i.code === 'background')
    expect(background?.fixes.map((f) => f.id)).toEqual(['remove', 'to-fill'])
  })

  it('imports an Inkscape export, naming layers and dropping editor attributes', async () => {
    const { groups } = await importSvgFiles([file('inkscape.svg')])
    expect(names(groups[0]?.layers ?? [])).toEqual(['Leaf', 'Background'])
    expect(groups[0]?.layers[0]?.svg).not.toContain('inkscape:')
    expect(groups[0]?.layers[1]?.svg).toContain('fill="#2b8a3e"')
    expect(groups[0]?.layers[1]?.issues.map((i) => i.code)).toContain('background')
    expect(groups[0]?.layers[0]?.issues).toEqual([])
  })

  it('imports an Affinity export and keeps its matrices', async () => {
    const { groups } = await importSvgFiles([file('affinity.svg')])
    expect(names(groups[0]?.layers ?? [])).toEqual(['Artboard'])
    expect(groups[0]?.layers[0]?.svg).toContain('matrix(1.5,0,0,1.5,-100,-100)')
    expect(groups[0]?.layers[0]?.svg).not.toContain('serif:')
    expect(groups[0]?.layers[0]?.sourceViewBox).toEqual([0, 0, 400, 400])
  })

  it('turns a nested <svg> into its own group, above the file group', async () => {
    const { groups } = await importSvgFiles([file('nested-svg.svg')])
    expect(groups.map((g) => g.name)).toEqual(['Badge', 'nested-svg'])
    expect(names(groups[0]?.layers ?? [])).toEqual(['Tick', 'Ring'])
    expect(names(groups[1]?.layers ?? [])).toEqual(['Frame'])
    expect(groups[0]?.layers[1]?.svg).toContain('matrix(10 0 0 10 50 50)')
  })

  it('flags background, filter, mask and text issues', async () => {
    const backgrounds = await importSvgFiles([file('background-gradient.svg')])
    const bottom = backgrounds.groups[0]?.layers.at(-1)
    const fill = bottom?.issues.find((i) => i.code === 'background')
    expect(fill?.fixes.map((f) => f.id)).toEqual(['remove', 'to-fill'])

    const filters = await importSvgFiles([file('filter-mask.svg')])
    const codes = filters.groups[0]?.layers.flatMap((l) => l.issues.map((i) => i.code)) ?? []
    expect(codes).toContain('filter')
    expect(codes).toContain('mask')

    const text = await importSvgFiles([file('text.svg')])
    expect(text.groups[0]?.layers.flatMap((l) => l.issues.map((i) => i.code))).toContain('text')
  })

  it('rejects unsafe documents by name and reason, without throwing', async () => {
    const result = await importSvgFiles([
      file('bad-script.svg'),
      file('bad-external.svg'),
      { name: 'broken.svg', data: '<svg><g></svg>' },
      { name: 'notsvg.svg', data: '<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>' },
    ])
    expect(result.groups).toEqual([])
    expect(result.rejected.map((r) => r.file)).toEqual([
      'bad-script.svg',
      'bad-external.svg',
      'broken.svg',
      'notsvg.svg',
    ])
    expect(result.rejected[0]?.reason).toMatch(/script/i)
    expect(result.rejected[1]?.reason).toMatch(/external/i)
    expect(result.rejected[2]?.reason).toMatch(/parse/i)
    expect(result.rejected[3]?.reason).toMatch(/svg/i)
  })

  it('rejects a document with nothing to draw', async () => {
    const result = await importSvgFiles([
      { name: 'blank.svg', data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>' },
    ])
    expect(result.groups).toEqual([])
    expect(result.rejected[0]?.reason).toMatch(/nothing/i)
  })

  it('still imports the good files alongside rejected ones', async () => {
    const result = await importSvgFiles([file('bad-script.svg'), file('figma.svg')])
    expect(result.rejected).toHaveLength(1)
    expect(result.groups).toHaveLength(1)
    // one file survived, so it is imported as a single file: split, named after itself
    expect(result.groups[0]?.name).toBe('figma')
  })

  it('splits the one surviving file rather than lumping it into Imported', async () => {
    const result = await importSvgFiles([file('bad-script.svg'), file('illustrator.svg')])
    expect(names(result.groups[0]?.layers ?? [])).toEqual(['Layer 3', 'hero', 'Layer 1'])
  })

  it('puts several files in one Imported group, first file bottom-most', async () => {
    const { groups, rejected } = await importSvgFiles([
      file('background-rect.svg'),
      file('text.svg'),
      file('affinity.svg'),
    ])
    expect(rejected).toEqual([])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.name).toBe('Imported')
    expect(names(groups[0]?.layers ?? [])).toEqual(['affinity', 'text', 'background-rect'])
    expect(groups[0]?.layers[2]?.issues.map((i) => i.code)).toContain('background')
    expect(groups[0]?.layers[0]?.issues).toEqual([])
  })

  it('accepts raw bytes and gzipped .svgz payloads', async () => {
    const bytes = new TextEncoder().encode(fixture('figma.svg'))
    const plain = await importSvgFiles([{ name: 'figma.svg', data: bytes }])
    expect(plain.groups[0]?.layers).toHaveLength(1)

    const zipped = await importSvgFiles([{ name: 'icon.svgz', data: gzipSync(bytes) }])
    expect(zipped.rejected).toEqual([])
    expect(zipped.groups[0]?.name).toBe('icon')
    expect(zipped.groups[0]?.layers).toHaveLength(1)
  })

  it('uses a supplied measurer for every layer bbox', async () => {
    const { groups } = await importSvgFiles([file('figma.svg')], {
      measurer: () => ({ x: 1, y: 2, width: 3, height: 4 }),
    })
    expect(groups[0]?.layers[0]?.bbox).toEqual({ x: 1, y: 2, width: 3, height: 4 })
  })

  it('measures layer bounds from the artwork by default', async () => {
    const { groups } = await importSvgFiles([file('background-rect.svg')])
    expect(groups[0]?.layers[0]?.bbox).toEqual({ x: 320, y: 320, width: 384, height: 384 })
  })

  it('folds a root opacity into every imported layer', async () => {
    const { groups } = await importSvgFiles([
      {
        name: 'faded.svg',
        data: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" opacity="0.5"><rect width="4" height="4"/><circle r="2"/></svg>',
      },
    ])
    const layers = groups[0]?.layers ?? []
    expect(layers).toHaveLength(2)
    for (const layer of layers) {
      expect(layer.opacity).toBeCloseTo(0.5)
      expect(layer.svg).not.toContain('opacity=')
    }
  })

  it('re-exports the public types', () => {
    const parsed: ParseResult = { ok: false, reason: 'nope' }
    const rule: StyleRule = {
      selector: '.a',
      declarations: { fill: 'red' },
      specificity: [0, 1, 0],
      order: 0,
    }
    expect(parsed.ok).toBe(false)
    expect(rule.selector).toBe('.a')
  })

  it('returns nothing for no files', async () => {
    expect(await importSvgFiles([])).toEqual({ groups: [], rejected: [] })
  })
})
