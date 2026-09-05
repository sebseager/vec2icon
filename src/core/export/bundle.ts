import { zipSync } from 'fflate'
import type { IconDoc } from '../model/types'
import { CANVAS_SIZE } from '../model/types'
import { assetNames, sanitizeName, serializeIconJson, toIconJson } from './iconjson'
import { type Rasterize, rasterizeSvg } from './png'
import { layerAssetSvg } from './svg-asset'

export type BundleOptions = {
  assetFormat: 'svg' | 'png'
  rasterize?: Rasterize
}

export type Bundle = {
  fileName: string
  blob: Blob
  /** Zip entry paths, in the order they were written. */
  entries: string[]
}

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

/** The `.icon` package contents, keyed by path inside the zip. */
export const bundleFiles = async (
  doc: IconDoc,
  opts: BundleOptions,
): Promise<Record<string, Uint8Array>> => {
  const root = `${sanitizeName(doc.name, 'Icon')}.icon`
  const names = assetNames(doc, opts.assetFormat)
  const rasterize = opts.rasterize ?? rasterizeSvg
  // The very same `names` map feeds icon.json and the Assets entries, so the
  // `image-name` references and the files on disk cannot drift apart.
  const files: Record<string, Uint8Array> = {
    [`${root}/icon.json`]: encode(serializeIconJson(toIconJson(doc, names))),
  }

  for (const group of doc.groups) {
    for (const layer of group.layers) {
      const name = names.get(layer.id)
      if (!name) continue
      const svg = layerAssetSvg(layer)
      files[`${root}/Assets/${name}`] =
        opts.assetFormat === 'png'
          ? new Uint8Array(await (await rasterize(svg, CANVAS_SIZE)).arrayBuffer())
          : encode(svg)
    }
  }
  return files
}

/** Zip the `.icon` package. Assets are already compact, so entries are stored
 * rather than deflated. */
export const buildBundle = async (doc: IconDoc, opts: BundleOptions): Promise<Bundle> => {
  const files = await bundleFiles(doc, opts)
  const zipped = zipSync(files, { level: 0 })
  return {
    fileName: `${sanitizeName(doc.name, 'Icon')}.icon.zip`,
    blob: new Blob([zipped], { type: 'application/zip' }),
    entries: Object.keys(files),
  }
}
