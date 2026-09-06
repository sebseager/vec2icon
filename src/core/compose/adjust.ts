/** Editing one existing layer: what the model sees, and how its reply becomes new artwork. */
import type { BBox, Layer } from '../model/types'
import {
  lintLayer,
  measureBBox,
  parseSvg,
  readViewBox,
  rejectionReason,
  resolveStyles,
  wholeDocumentLayer,
} from '../svg'
import { ADJUST_SYSTEM_PROMPT, adjustFixMessage, adjustMessage } from './prompt'
import type { Task } from './run'

/** A layer's artwork as a standalone document the model can edit and hand back. */
export const layerDocument = (
  layer: Pick<Layer, 'name' | 'svg' | 'defs' | 'sourceViewBox'>,
): string => {
  const title = layer.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const defs = layer.defs ? `<defs>${layer.defs}</defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${layer.sourceViewBox.join(' ')}"><title>${title}</title>${defs}${layer.svg}</svg>`
}

/** New artwork for the layer, in the same source units it already uses. */
export type AdjustedArt = { svg: string; defs: string; bbox: BBox }

export type AdjustValidation = { problems: string[]; parsed: AdjustedArt | null }

const sameViewBox = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((n, i) => n === b[i])

export const validateAdjusted = async (svg: string, layer: Layer): Promise<AdjustValidation> => {
  const parsed = parseSvg(svg)
  if (!parsed.ok) return { problems: [`Not well-formed: ${parsed.reason}`], parsed: null }
  const refusal = rejectionReason(parsed.root)
  if (refusal) return { problems: [refusal], parsed: null }

  const problems: string[] = []
  if (!sameViewBox(readViewBox(parsed.root), layer.sourceViewBox)) {
    problems.push(`The viewBox must stay "${layer.sourceViewBox.join(' ')}".`)
  }

  resolveStyles(parsed.root)
  const split = wholeDocumentLayer(parsed.root, layer.name)
  if (split.svg === '<g/>') {
    problems.push('The document draws nothing.')
    return { problems, parsed: null }
  }
  const bbox = measureBBox(split.svg, split.defs, layer.sourceViewBox)
  const art: AdjustedArt = { svg: split.svg, defs: split.defs, bbox }
  for (const issue of lintLayer({ ...layer, ...art, issues: [] }, { bottomMost: false })) {
    problems.push(`${issue.message}.${issue.help ? ` ${issue.help}` : ''}`)
  }
  return { problems, parsed: art }
}

export const adjustTask = (instruction: string, layer: Layer): Task<AdjustedArt> => {
  const document = layerDocument(layer)
  return {
    system: ADJUST_SYSTEM_PROMPT,
    first: adjustMessage(instruction, document),
    fix: (previousSvg, problems) => adjustFixMessage(instruction, previousSvg, problems),
    validate: (svg) => validateAdjusted(svg, layer),
  }
}
