/** Dollars: an upper bound before the call, and the real figure after it. */

/** List price in dollars per million tokens. */
export type Pricing = { input: number; output: number }

export const OPUS_5_PRICING: Pricing = { input: 5, output: 25 }

/** The slice of the API's usage report that costs money. */
export type Usage = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

/** SVG and prompt text tokenizes densely; three characters a token is a safe floor. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 3)

/** Framing the API adds around a message, and our own feedback wording. */
const TURN_OVERHEAD_TOKENS = 100
const FEEDBACK_TOKENS = 400

export type BoundInput = {
  systemTokens: number
  briefTokens: number
  maxOutputTokens: number
  /** Extra turns the model may spend fixing rejected output. */
  fixTurns: number
  pricing: Pricing
}

/**
 * The most a compose run can cost: every turn spends the whole output budget, and every
 * fix turn re-reads a maximal previous document on top of the brief.
 */
export const costBound = ({
  systemTokens,
  briefTokens,
  maxOutputTokens,
  fixTurns,
  pricing,
}: BoundInput): number => {
  const base = systemTokens + briefTokens + TURN_OVERHEAD_TOKENS
  const firstInput = base
  const fixInput = base + maxOutputTokens + FEEDBACK_TOKENS
  const inputTokens = firstInput + fixTurns * fixInput
  const outputTokens = (1 + fixTurns) * maxOutputTokens
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
}

/** Cache writes bill at 1.25x input, reads at 0.1x. */
export const costOf = (usages: Usage[], pricing: Pricing): number => {
  let dollars = 0
  for (const usage of usages) {
    const written = usage.cache_creation_input_tokens ?? 0
    const read = usage.cache_read_input_tokens ?? 0
    dollars +=
      (usage.input_tokens * pricing.input +
        written * pricing.input * 1.25 +
        read * pricing.input * 0.1 +
        usage.output_tokens * pricing.output) /
      1_000_000
  }
  return dollars
}

/** "$0.12", or "<$0.01" for amounts that would round to nothing. */
export const formatUsd = (dollars: number): string => {
  if (dollars > 0 && dollars < 0.005) return '<$0.01'
  return `$${dollars.toFixed(2)}`
}
