import { createGroup, createLayer } from '../model/defaults'
import type { Group, Layer, ViewBox } from '../model/types'
import { type Measurer, measureBBox } from './bbox'
import { fitLayersToCanvas } from './fit'
import { relintLayers } from './lint'
import { decodeSvgBytes, parseSvg, readViewBox } from './parse'
import { rejectionReason } from './sanitize'
import { type SplitItem, type SplitLayer, splitRoot, wholeDocumentLayer } from './split'
import { resolveStyles } from './styles'

export type ImportFile = { name: string; data: Uint8Array | string }
export type ImportResult = { groups: Group[]; rejected: { file: string; reason: string }[] }

const basename = (name: string): string =>
  (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, '') || name

const toLayer = (
  split: SplitLayer,
  sourceViewBox: ViewBox,
  measurer: Measurer | undefined,
): Layer =>
  createLayer({
    name: split.name,
    svg: split.svg,
    defs: split.defs,
    sourceViewBox,
    bbox: measureBBox(split.svg, split.defs, sourceViewBox, measurer),
    opacity: split.opacity,
  })

/** Prepare one file for splitting; returns the reason it cannot be imported instead. */
const openFile = (
  file: ImportFile,
): { root: SVGSVGElement; viewBox: ViewBox } | { reason: string } => {
  const text = typeof file.data === 'string' ? file.data : decodeSvgBytes(file.data)
  const parsed = parseSvg(text)
  if (!parsed.ok) return { reason: parsed.reason }
  const refusal = rejectionReason(parsed.root)
  if (refusal) return { reason: refusal }
  resolveStyles(parsed.root)
  return { root: parsed.root, viewBox: readViewBox(parsed.root) }
}

/** Groups for a single file: its top-level layers, plus one group per nested `<svg>`. */
const groupsForSingleFile = (
  items: SplitItem[],
  fileName: string,
  viewBox: ViewBox,
  measurer: Measurer | undefined,
): Group[] => {
  const fileGroup = createGroup(fileName)
  const paintOrder: Group[] = []

  for (const item of items) {
    if (item.kind === 'group') {
      const layers = item.layers.map((l) => toLayer(l, viewBox, measurer))
      paintOrder.push(createGroup(item.name, layers.reverse()))
      continue
    }
    // the file's own group takes the paint slot of its first top-level layer
    if (fileGroup.layers.length === 0) paintOrder.push(fileGroup)
    fileGroup.layers.push(toLayer(item.layer, viewBox, measurer))
  }

  fileGroup.layers.reverse()
  return paintOrder.reverse()
}

/** One file's groups fitted to the canvas as a single piece, so nothing overhangs. */
const fitGroupsToCanvas = (groups: Group[]): Group[] => {
  const fitted = new Map(
    fitLayersToCanvas(groups.flatMap((g) => g.layers)).map((layer) => [layer.id, layer]),
  )
  return groups.map((group) => ({
    ...group,
    layers: group.layers.map((layer) => fitted.get(layer.id) ?? layer),
  }))
}

/**
 * Turn dropped files into groups of layers, top-most first. Files that cannot be
 * imported safely are reported in `rejected` rather than thrown.
 */
export const importSvgFiles = async (
  files: ImportFile[],
  opts?: { measurer?: Measurer },
): Promise<ImportResult> => {
  const measurer = opts?.measurer
  const rejected: { file: string; reason: string }[] = []
  const opened: { file: ImportFile; root: SVGSVGElement; viewBox: ViewBox }[] = []

  for (const file of files) {
    try {
      const result = openFile(file)
      if ('reason' in result) rejected.push({ file: file.name, reason: result.reason })
      else opened.push({ file, root: result.root, viewBox: result.viewBox })
    } catch (error) {
      rejected.push({ file: file.name, reason: (error as Error).message })
    }
  }

  const single = opened[0]
  if (opened.length === 1 && single) {
    try {
      const items = splitRoot(single.root)
      if (items.length === 0) {
        rejected.push({ file: single.file.name, reason: 'Contains nothing to draw' })
        return { groups: [], rejected }
      }
      const groups = fitGroupsToCanvas(
        groupsForSingleFile(items, basename(single.file.name), single.viewBox, measurer),
      )
      return {
        groups: groups.map((group) => ({ ...group, layers: relintLayers(group.layers) })),
        rejected,
      }
    } catch (error) {
      rejected.push({ file: single.file.name, reason: (error as Error).message })
      return { groups: [], rejected }
    }
  }

  const layers: Layer[] = []
  for (const entry of opened) {
    try {
      const split = wholeDocumentLayer(entry.root, basename(entry.file.name))
      layers.push(...fitLayersToCanvas([toLayer(split, entry.viewBox, measurer)]))
    } catch (error) {
      rejected.push({ file: entry.file.name, reason: (error as Error).message })
    }
  }
  if (layers.length === 0) return { groups: [], rejected }

  // File order is paint order, so the last file ends up top-most.
  return { groups: [createGroup('Imported', relintLayers(layers.reverse()))], rejected }
}

export { backgroundFill, detectBackground, parseCssColor, removeBackground } from './background'
export {
  domMeasurer,
  type Measurer,
  measureBBox,
  pureMeasurer,
  setDefaultMeasurer,
} from './bbox'
export { colorKey, type LayerColor, layerColors, recolorLayer } from './colors'
export { collectDefs, referencedIds } from './defs'
export { prefixIds } from './ids'
export { applyLayerFix, lintDoc, lintLayer, relintLayers } from './lint'
export { decodeSvgBytes, type ParseResult, parseSvg, readViewBox } from './parse'
export { rejectionReason, sanitizeElement } from './sanitize'
export {
  isRenderable,
  layerName,
  mergeLayers,
  type SplitGroup,
  type SplitItem,
  type SplitLayer,
  splitLayer,
  splitRoot,
  wholeDocumentLayer,
} from './split'
export {
  PRESENTATION_PROPERTIES,
  parseStylesheet,
  resolveStyles,
  type StyleRule,
  specificity,
} from './styles'
