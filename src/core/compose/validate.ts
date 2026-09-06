/** Run a composed SVG through the same gate a dropped file goes through, and say what failed. */
import type { Fill, Group, Layer } from '../model/types'
import { CANVAS_SIZE } from '../model/types'
import { backgroundFill, importSvgFiles, lintDoc, parseSvg, readViewBox } from '../svg'

export type Parsed = {
  /** From `<title>`, or a fallback when it was missing. */
  name: string
  /** Ready to import; the background layer has already been lifted out into `fill`. */
  groups: Group[]
  /** The solid background the model drew, to become the document fill. */
  fill: Fill | null
}

export type Validation = {
  problems: string[]
  /** What the importer made of the document, whenever it parsed at all. */
  parsed: Parsed | null
}

export const FALLBACK_NAME = 'Composed icon'

const titleOf = (root: Element): string | null => {
  for (const child of Array.from(root.children)) {
    if (child.localName === 'title') {
      const text = (child.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (text) return text
    }
  }
  return null
}

const describeIssue = (layer: Layer, message: string, help?: string): string =>
  `Layer "${layer.name}": ${message}.${help ? ` ${help}` : ''}`

/** Lift the model's background rect out of the bottom layer into a document fill. */
const liftBackground = (
  groups: Group[],
  problems: string[],
): { groups: Group[]; fill: Fill | null } => {
  const last = groups.at(-1)
  const bottom = last?.layers.at(-1)
  if (!last || !bottom) return { groups, fill: null }
  if (!bottom.issues.some((issue) => issue.code === 'background')) return { groups, fill: null }
  const fill = backgroundFill(bottom)
  if (!fill) {
    problems.push(
      describeIssue(
        bottom,
        'looks like a background but its fill cannot become the document fill',
        'A background must be one full-canvas rect filled with a solid color or a two-stop linear gradient, or be left out.',
      ),
    )
    return { groups, fill: null }
  }
  const trimmed = { ...last, layers: last.layers.slice(0, -1) }
  const rest = groups.slice(0, -1)
  return { groups: trimmed.layers.length > 0 ? [...rest, trimmed] : rest, fill }
}

export const validateComposed = async (svg: string): Promise<Validation> => {
  const problems: string[] = []

  const parsed = parseSvg(svg)
  if (!parsed.ok) return { problems: [`Not well-formed: ${parsed.reason}`], parsed: null }

  const [x, y, width, height] = readViewBox(parsed.root)
  if (x !== 0 || y !== 0 || width !== CANVAS_SIZE || height !== CANVAS_SIZE) {
    problems.push(`The viewBox must be "0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}".`)
  }

  const title = titleOf(parsed.root)
  if (!title) problems.push('Missing a <title> naming the icon as the first child of <svg>.')
  const name = title ?? FALLBACK_NAME

  const result = await importSvgFiles([{ name, data: svg }])
  for (const rejection of result.rejected) problems.push(rejection.reason)
  if (result.groups.length === 0) return { problems, parsed: null }

  const { groups, fill } = liftBackground(result.groups, problems)
  for (const group of groups) {
    for (const layer of group.layers) {
      for (const issue of layer.issues) {
        if (issue.code === 'background') continue
        problems.push(describeIssue(layer, issue.message, issue.help))
      }
    }
  }
  for (const issue of lintDoc({
    name,
    fill: { default: { kind: 'none' } },
    watchOS: false,
    groups,
  })) {
    problems.push(`${issue.message}. ${issue.help ?? ''}`.trim())
  }
  if (groups.every((group) => group.layers.length === 0)) {
    problems.push('The document draws nothing besides a background.')
  }

  return { problems, parsed: { name, groups, fill } }
}
