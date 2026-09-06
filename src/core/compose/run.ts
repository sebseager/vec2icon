/** The model loop: ask, check, and hand rejected output back a bounded number of times. */
import type { Usage } from './cost'
import { extractSvg } from './extract'
import { briefMessage, fixMessage, MAX_OUTPUT_TOKENS, SYSTEM_PROMPT } from './prompt'
import { type Parsed, validateComposed } from './validate'

export type GenerateRequest = { system: string; user: string; maxTokens: number }

/** One model reply. `refusal` carries the API's explanation when it declined. */
export type Generation = {
  text: string
  usage: Usage
  stopReason: 'end_turn' | 'max_tokens' | 'refusal' | (string & {}) | null
  refusal?: string
}

/** Whatever makes the API call. Injected so the loop is testable without a network. */
export type Generate = (request: GenerateRequest, signal?: AbortSignal) => Promise<Generation>

/** What one kind of job says to the model and how it judges the reply. */
export type Task<P> = {
  system: string
  /** The first user message. */
  first: string
  /** The user message for a fix turn: the rejected document and why. */
  fix: (previousSvg: string, problems: string[]) => string
  validate: (svg: string) => Promise<{ problems: string[]; parsed: P | null }>
}

export type RunOptions = {
  /** Extra turns to spend on fixes; 0 means one shot. */
  fixTurns: number
  signal?: AbortSignal
}

export type ComposeProgress = { turn: number; totalTurns: number; kind: 'compose' | 'fix' }

export type Outcome<P> =
  | { status: 'ok'; svg: string; parsed: P; usages: Usage[] }
  /** Every turn was spent and the last document still has problems. */
  | { status: 'invalid'; svg: string | null; parsed: P | null; problems: string[]; usages: Usage[] }
  | { status: 'refused'; reason: string; usages: Usage[] }
  | { status: 'cancelled'; usages: Usage[] }

const TRUNCATED = 'The reply was cut off at the output limit; make the document shorter.'
const NO_SVG = 'The reply contained no <svg> document.'

/** Shown back to the model in place of a document when the reply had none. */
const excerpt = (text: string): string => text.trim().slice(0, 2000)

export const runTask = async <P>(
  generate: Generate,
  task: Task<P>,
  { fixTurns, signal }: RunOptions,
  onProgress?: (progress: ComposeProgress) => void,
): Promise<Outcome<P>> => {
  const usages: Usage[] = []
  const totalTurns = 1 + Math.max(0, fixTurns)
  let user = task.first
  let svg: string | null = null
  let parsed: P | null = null
  let problems: string[] = []

  for (let turn = 1; turn <= totalTurns; turn++) {
    if (signal?.aborted) return { status: 'cancelled', usages }
    onProgress?.({ turn, totalTurns, kind: turn === 1 ? 'compose' : 'fix' })

    const reply = await generate(
      { system: task.system, user, maxTokens: MAX_OUTPUT_TOKENS },
      signal,
    )
    usages.push(reply.usage)
    if (reply.stopReason === 'refusal') {
      return {
        status: 'refused',
        reason: reply.refusal ?? 'The model declined this brief.',
        usages,
      }
    }

    svg = extractSvg(reply.text)
    problems = []
    parsed = null
    if (reply.stopReason === 'max_tokens') problems.push(TRUNCATED)
    if (svg) {
      const validation = await task.validate(svg)
      problems.push(...validation.problems)
      parsed = validation.parsed
    } else {
      problems.push(NO_SVG)
    }

    if (problems.length === 0 && svg && parsed) return { status: 'ok', svg, parsed, usages }
    user = task.fix(svg ?? excerpt(reply.text), problems)
  }

  return { status: 'invalid', svg, parsed, problems, usages }
}

export type ComposeOptions = RunOptions & { wish: string }
export type ComposeOutcome = Outcome<Parsed>

export const composeTask = (wish: string): Task<Parsed> => ({
  system: SYSTEM_PROMPT,
  first: briefMessage(wish),
  fix: (previousSvg, problems) => fixMessage(wish, previousSvg, problems),
  validate: validateComposed,
})

export const composeIcon = (
  generate: Generate,
  { wish, ...options }: ComposeOptions,
  onProgress?: (progress: ComposeProgress) => void,
): Promise<ComposeOutcome> => runTask(generate, composeTask(wish), options, onProgress)
