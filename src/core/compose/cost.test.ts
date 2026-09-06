import { describe, expect, it } from 'vitest'
import { costBound, costOf, estimateTokens, formatUsd, OPUS_5_PRICING } from './cost'

describe('estimateTokens', () => {
  it('rounds up at three characters a token', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abc')).toBe(1)
    expect(estimateTokens('abcd')).toBe(2)
  })
})

describe('costBound', () => {
  const base = {
    systemTokens: 900,
    briefTokens: 100,
    maxOutputTokens: 4096,
    pricing: OPUS_5_PRICING,
  }

  it('charges one full turn when no fixes are allowed', () => {
    const bound = costBound({ ...base, fixTurns: 0 })
    const expected = ((900 + 100 + 100) * 5 + 4096 * 25) / 1e6
    expect(bound).toBeCloseTo(expected, 6)
  })

  it('grows with every fix turn, each re-reading a maximal document', () => {
    const one = costBound({ ...base, fixTurns: 1 })
    const two = costBound({ ...base, fixTurns: 2 })
    const perFix = ((900 + 100 + 100 + 4096 + 400) * 5 + 4096 * 25) / 1e6
    expect(one - costBound({ ...base, fixTurns: 0 })).toBeCloseTo(perFix, 6)
    expect(two - one).toBeCloseTo(perFix, 6)
  })

  it('stays in the cents for a typical brief', () => {
    expect(costBound({ ...base, fixTurns: 1 })).toBeLessThan(0.25)
    expect(costBound({ ...base, fixTurns: 3 })).toBeLessThan(0.5)
  })
})

describe('costOf', () => {
  it('sums plain input and output across turns', () => {
    const dollars = costOf(
      [
        { input_tokens: 1000, output_tokens: 1000 },
        { input_tokens: 1000, output_tokens: 0 },
      ],
      OPUS_5_PRICING,
    )
    expect(dollars).toBeCloseTo((2000 * 5 + 1000 * 25) / 1e6, 9)
  })

  it('prices cache writes and reads at their own rates', () => {
    const dollars = costOf(
      [
        {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 1000,
          cache_read_input_tokens: 1000,
        },
      ],
      OPUS_5_PRICING,
    )
    expect(dollars).toBeCloseTo((1000 * 5 * 1.25 + 1000 * 5 * 0.1) / 1e6, 9)
  })
})

describe('formatUsd', () => {
  it('shows cents, and a floor for amounts that round away', () => {
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(0.004)).toBe('<$0.01')
    expect(formatUsd(0.005)).toBe('$0.01')
    expect(formatUsd(0.234)).toBe('$0.23')
  })
})
