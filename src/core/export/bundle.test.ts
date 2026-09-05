import { unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { createGroup, createLayer, emptyDoc } from '../model/defaults'
import type { IconDoc, Layer } from '../model/types'
import { buildBundle, bundleFiles } from './bundle'
import type { Rasterize } from './png'
import { layerAssetSvg } from './svg-asset'

const layer = (name: string): Layer =>
  createLayer({
    name,
    svg: `<g><title>${name}</title></g>`,
    defs: '',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 0, y: 0, width: 100, height: 100 },
  })

const doc = (name = 'My Icon'): IconDoc => ({
  ...emptyDoc(name),
  groups: [
    createGroup('Top', [layer('Shape'), layer('Shape')]),
    createGroup('Back', [layer('BG')]),
  ],
})

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

describe('bundleFiles', () => {
  it('lays out icon.json and one asset per layer under <Name>.icon', async () => {
    const files = await bundleFiles(doc(), { assetFormat: 'svg' })
    expect(Object.keys(files).sort()).toEqual([
      'My Icon.icon/Assets/BG.svg',
      'My Icon.icon/Assets/Shape 2.svg',
      'My Icon.icon/Assets/Shape.svg',
      'My Icon.icon/icon.json',
    ])
  })

  it('sanitizes the document name and falls back to Icon', async () => {
    expect(Object.keys(await bundleFiles(doc('A/B'), { assetFormat: 'svg' }))[0]).toContain(
      'A-B.icon/',
    )
    expect(Object.keys(await bundleFiles(doc('  '), { assetFormat: 'svg' }))[0]).toContain(
      'Icon.icon/',
    )
  })

  it('names the package Icon when the document name is punctuation only', async () => {
    expect(Object.keys(await bundleFiles(doc('///'), { assetFormat: 'svg' }))[0]).toContain(
      'Icon.icon/',
    )
  })

  it('writes the layer asset svg verbatim', async () => {
    const d = doc()
    const files = await bundleFiles(d, { assetFormat: 'svg' })
    const first = d.groups[0]?.layers[0]
    expect(first && decode(files['My Icon.icon/Assets/Shape.svg'] as Uint8Array)).toBe(
      layerAssetSvg(first as Layer),
    )
  })

  it('writes an icon.json whose image-names match the asset entries exactly', async () => {
    const files = await bundleFiles(doc(), { assetFormat: 'svg' })
    const json = JSON.parse(decode(files['My Icon.icon/icon.json'] as Uint8Array)) as {
      groups: { layers: { 'image-name': string }[] }[]
    }
    const referenced = json.groups.flatMap((g) => g.layers.map((l) => l['image-name'])).sort()
    const assets = Object.keys(files)
      .filter((k) => k.includes('/Assets/'))
      .map((k) => k.slice(k.indexOf('/Assets/') + '/Assets/'.length))
      .sort()
    expect(referenced).toEqual(assets)
  })

  it('rasterizes once per layer at 1024 for the png format', async () => {
    const rasterize = vi.fn<Rasterize>(async () => new Blob([new Uint8Array([137, 80, 78, 71])]))
    const files = await bundleFiles(doc(), { assetFormat: 'png', rasterize })
    expect(rasterize).toHaveBeenCalledTimes(3)
    for (const call of rasterize.mock.calls) expect(call[1]).toBe(1024)
    expect(Object.keys(files)).toContain('My Icon.icon/Assets/Shape.png')
    expect(files['My Icon.icon/Assets/Shape.png']).toEqual(new Uint8Array([137, 80, 78, 71]))
  })

  it('references .png image names when the png format is used', async () => {
    const rasterize = vi.fn<Rasterize>(async () => new Blob([new Uint8Array([1])]))
    const files = await bundleFiles(doc(), { assetFormat: 'png', rasterize })
    expect(decode(files['My Icon.icon/icon.json'] as Uint8Array)).toContain('"Shape.png"')
  })
})

describe('buildBundle', () => {
  it('produces a zip that round trips through fflate', async () => {
    const bundle = await buildBundle(doc(), { assetFormat: 'svg' })
    expect(bundle.fileName).toBe('My Icon.icon.zip')
    expect(bundle.entries.sort()).toEqual([
      'My Icon.icon/Assets/BG.svg',
      'My Icon.icon/Assets/Shape 2.svg',
      'My Icon.icon/Assets/Shape.svg',
      'My Icon.icon/icon.json',
    ])

    const bytes = new Uint8Array(await bundle.blob.arrayBuffer())
    const unzipped = unzipSync(bytes)
    expect(Object.keys(unzipped).sort()).toEqual(bundle.entries.sort())
    expect(JSON.parse(decode(unzipped['My Icon.icon/icon.json'] as Uint8Array))).toMatchObject({
      'supported-platforms': { squares: 'shared' },
    })
  })

  it('stores entries without compression', async () => {
    const bundle = await buildBundle(doc(), { assetFormat: 'svg' })
    const bytes = new Uint8Array(await bundle.blob.arrayBuffer())
    // local file header compression method (offset 8) must be 0 = stored
    expect(bytes[8]).toBe(0)
    expect(bytes[9]).toBe(0)
  })
})
