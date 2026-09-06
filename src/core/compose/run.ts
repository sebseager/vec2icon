/** The compose loop: ask, check, and hand rejected output back a bounded number of times. */
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

export type ComposeOptions = {
  wish: string
  /** Extra turns to spend on fixes; 0 means one shot. */
  fixTurns: number
  signal?: AbortSignal
}

export type ComposeProgress = { turn: number; totalTurns: number; kind: 'compose' | 'fix' }

export type ComposeOutcome =
  | { status: 'ok'; svg: string; parsed: Parsed; usages: Usage[] }
  /** Every turn was spent and the last document still has problems. */
  | {
      status: 'invalid'
      svg: string | null
      parsed: Parsed | null
      problems: string[]
      usages: Usage[]
    }
  | { status: 'refused'; reason: string; usages: Usage[] }
  | { status: 'cancelled'; usages: Usage[] }

const TRUNCATED = 'The reply was cut off at the output limit; make the document shorter.'
const NO_SVG = 'The reply contained no <svg> document.'

/** Shown back to the model in place of a document when the reply had none. */
const excerpt = (text: string): string => text.trim().slice(0, 2000)

export const composeIcon = async (
  generate: Generate,
  { wish, fixTurns, signal }: ComposeOptions,
  onProgress?: (progress: ComposeProgress) => void,
): Promise<ComposeOutcome> => {
  const usages: Usage[] = []
  const totalTurns = 1 + Math.max(0, fixTurns)
  let user = briefMessage(wish)
  let svg: string | null = null
  let parsed: Parsed | null = null
  let problems: string[] = []

  for (let turn = 1; turn <= totalTurns; turn++) {
    if (signal?.aborted) return { status: 'cancelled', usages }
    onProgress?.({ turn, totalTurns, kind: turn === 1 ? 'compose' : 'fix' })

    const reply = await generate(
      { system: SYSTEM_PROMPT, user, maxTokens: MAX_OUTPUT_TOKENS },
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
      const validation = await validateComposed(svg)
      problems.push(...validation.problems)
      parsed = validation.parsed
    } else {
      problems.push(NO_SVG)
    }

    if (problems.length === 0 && svg && parsed) return { status: 'ok', svg, parsed, usages }
    user = fixMessage(wish, svg ?? excerpt(reply.text), problems)
  }

  return { status: 'invalid', svg, parsed, problems, usages }
}
