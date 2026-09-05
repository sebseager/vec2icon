/** Turning the export dialog's choices into downloaded files. */
import {
  buildBundle,
  combinedSvg,
  downloadBlob,
  flatPng,
  rasterizeSvg,
  type SaveType,
  sanitizeName,
} from '@/core/export'
import type { IconDoc } from '@/core/model/types'
import { CANVAS_SIZE } from '@/core/model/types'
import type { Renderer, RenderOptions } from '@/core/render'

export type AssetFormat = 'svg' | 'png'
export type FlatGlass = 'none' | 'approximate'

export type ExportOptions = {
  assetFormat: AssetFormat
  flatPng: boolean
  flatGlass: FlatGlass
  combinedSvg: boolean
  combinedBackground: boolean
}

export const defaultExportOptions = (): ExportOptions => ({
  assetFormat: 'svg',
  flatPng: false,
  flatGlass: 'none',
  combinedSvg: false,
  combinedBackground: true,
})

const ZIP_TYPE: SaveType = {
  description: 'Icon Composer package',
  accept: { 'application/zip': ['.zip'] },
}
const PNG_TYPE: SaveType = { description: 'PNG image', accept: { 'image/png': ['.png'] } }
const SVG_TYPE: SaveType = { description: 'SVG image', accept: { 'image/svg+xml': ['.svg'] } }

export type RunExportDeps = {
  doc: IconDoc
  options: ExportOptions
  /** The preview's current options, reused for the approximate-glass PNG. */
  renderOptions: RenderOptions
  getRenderer: () => Renderer | null
  toast: (message: string) => void
}

const messageOf = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : 'something went wrong'

/** The flat PNG, from the live renderer when glass was asked for and one exists.
 * Either way the PNG is cut to the platform's icon silhouette, so the two paths
 * produce the same framing. */
const flatPngBlob = async ({
  doc,
  options,
  renderOptions,
  getRenderer,
  toast,
}: RunExportDeps): Promise<Blob> => {
  if (options.flatGlass === 'approximate') {
    const renderer = getRenderer()
    if (renderer) {
      return await renderer.toBlob(doc, { ...renderOptions, rendition: 'default' }, CANVAS_SIZE)
    }
    toast('The preview was unavailable, so the flat PNG was saved without glass.')
  }
  return await flatPng(doc, CANVAS_SIZE, { platform: renderOptions.platform })
}

const listNames = (names: string[]): string =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/** Writes the `.icon` bundle and any extras the dialog asked for. Returns false
 * when something went wrong or the user cancelled a save panel, so the dialog
 * stays open and no success toast claims a file that was never written. */
export const runExport = async (deps: RunExportDeps): Promise<boolean> => {
  const { doc, options, toast } = deps
  const name = sanitizeName(doc.name, 'Icon')
  const cancelled: string[] = []

  /** Saves one file; records the name when the user dismissed the save panel. */
  const save = async (blob: Blob, fileName: string, type: SaveType): Promise<boolean> => {
    const result = await downloadBlob(blob, fileName, { types: [type] })
    if (result === 'cancelled') cancelled.push(fileName)
    return result !== 'cancelled'
  }

  try {
    const bundle = await buildBundle(doc, {
      assetFormat: options.assetFormat,
      rasterize: rasterizeSvg,
    })
    if (!(await save(bundle.blob, bundle.fileName, ZIP_TYPE))) {
      toast('Export cancelled — nothing was saved.')
      return false
    }

    if (options.flatPng) {
      await save(await flatPngBlob(deps), `${name}.png`, PNG_TYPE)
    }

    if (options.combinedSvg) {
      const svg = combinedSvg(doc, { background: options.combinedBackground })
      await save(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`, SVG_TYPE)
    }

    if (cancelled.length > 0) {
      toast(`Saved ${name}.icon, but ${listNames(cancelled)} was cancelled.`)
      return false
    }

    toast(`Exported ${name}.icon`)
    return true
  } catch (err) {
    toast(`Export failed: ${messageOf(err)}`)
    return false
  }
}
