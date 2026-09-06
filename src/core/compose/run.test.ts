import { describe, expect, it, vi } from 'vitest'
import { MAX_OUTPUT_TOKENS, SYSTEM_PROMPT } from './prompt'
import { composeIcon, type Generate, type Generation } from './run'

const wrap = (body: string, viewBox = '0 0 1024 1024'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`

const GOOD = wrap('<title>Dot</title><g id="dot"><circle cx="512" cy="512" r="9" fill="#000"/></g>')
const BAD_VIEWBOX = wrap(
  '<title>Dot</title><g id="dot"><circle cx="5" cy="5" r="1" fill="#000"/></g>',
  '0 0 10 10',
)

const reply = (text: string, extra: Partial<Generation> = {}): Generation => ({
  text,
  usage: { input_tokens: 10, output_tokens: 20 },
  stopReason: 'end_turn',
  ...extra,
})

const scripted = (...replies: Generation[]): Generate & { calls: string[] } => {
  const calls: string[] = []
  const generate = vi.fn(async (request) => {
    calls.push(request.user)
    const next = replies.shift()
    if (!next) throw new Error('unexpected extra turn')
    return next
  }) as unknown as Generate & { calls: string[] }
  generate.calls = calls
  return generate
}

describe('composeIcon', () => {
  it('sends the frozen system prompt and returns a valid first try', async () => {
    const generate = scripted(reply(GOOD))
    const progress = vi.fn()
    const outcome = await composeIcon(generate, { wish: 'a dot', fixTurns: 2 }, progress)
    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    expect(outcome.parsed.name).toBe('Dot')
    expect(outcome.usages).toHaveLength(1)
    expect(generate).toHaveBeenCalledWith(
      { system: SYSTEM_PROMPT, user: 'Icon brief:\na dot', maxTokens: MAX_OUTPUT_TOKENS },
      undefined,
    )
    expect(progress).toHaveBeenCalledTimes(1)
    expect(progress).toHaveBeenCalledWith({ turn: 1, totalTurns: 3, kind: 'compose' })
  })

  it('hands the rejected document and its problems back, then accepts the fix', async () => {
    const generate = scripted(reply(BAD_VIEWBOX), reply(GOOD))
    const progress = vi.fn()
    const outcome = await composeIcon(generate, { wish: 'a dot', fixTurns: 1 }, progress)
    expect(outcome.status).toBe('ok')
    expect(generate.calls[1]).toContain(BAD_VIEWBOX)
    expect(generate.calls[1]).toContain('- The viewBox must be "0 0 1024 1024".')
    expect(generate.calls[1]).toContain('Icon brief:\na dot')
    expect(progress).toHaveBeenLastCalledWith({ turn: 2, totalTurns: 2, kind: 'fix' })
    if (outcome.status === 'ok') expect(outcome.usages).toHaveLength(2)
  })

  it('gives up after the fix budget with the last document and its problems', async () => {
    const generate = scripted(reply(BAD_VIEWBOX), reply(BAD_VIEWBOX))
    const outcome = await composeIcon(generate, { wish: 'a dot', fixTurns: 1 })
    expect(outcome.status).toBe('invalid')
    if (outcome.status !== 'invalid') return
    expect(outcome.svg).toBe(BAD_VIEWBOX)
    expect(outcome.parsed?.groups).toHaveLength(1)
    expect(outcome.problems).toEqual(['The viewBox must be "0 0 1024 1024".'])
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('does not retry at all with zero fix turns', async () => {
    const generate = scripted(reply(BAD_VIEWBOX))
    const outcome = await composeIcon(generate, { wish: 'a dot', fixTurns: 0 })
    expect(outcome.status).toBe('invalid')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('treats a truncated reply and a reply without svg as problems to fix', async () => {
    const generate = scripted(
      reply('Sure! Here is a start <svg', { stopReason: 'max_tokens' }),
      reply('I cannot draw that.'),
      reply(GOOD),
    )
    const outcome = await composeIcon(generate, { wish: 'a dot', fixTurns: 2 })
    expect(outcome.status).toBe('ok')
    expect(generate.calls[1]).toContain('cut off at the output limit')
    expect(generate.calls[1]).toContain('contained no <svg> document')
    expect(generate.calls[1]).toContain('Sure! Here is a start')
    expect(generate.calls[2]).toContain('contained no <svg> document')
  })

  it('stops on a refusal and reports the explanation', async () => {
    const generate = scripted(reply('', { stopReason: 'refusal', refusal: 'Not this one.' }))
    const outcome = await composeIcon(generate, { wish: 'a dot', fixTurns: 3 })
    expect(outcome).toEqual({
      status: 'refused',
      reason: 'Not this one.',
      usages: [{ input_tokens: 10, output_tokens: 20 }],
    })
  })

  it('stops between turns once the signal is aborted', async () => {
    const controller = new AbortController()
    const generate = scripted(reply(BAD_VIEWBOX), reply(GOOD))
    const outcome = await composeIcon(
      generate,
      {
        wish: 'a dot',
        fixTurns: 1,
        signal: controller.signal,
      },
      () => controller.abort(),
    )
    expect(outcome.status).toBe('cancelled')
    expect(generate).toHaveBeenCalledTimes(1)
  })
})
