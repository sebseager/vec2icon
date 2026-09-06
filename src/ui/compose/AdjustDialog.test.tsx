import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Generate, Generation } from '@/core/compose'
import { layerDocument } from '@/core/compose'
import { createGroup, createLayer } from '@/core/model/defaults'
import { useEditor } from '@/state'
import { resetEditor } from '@/ui/test-utils'
import { AdjustDialog } from './AdjustDialog'
import { createGenerate } from './lib/anthropic'
import type { KeyStore } from './lib/keyStorage'

vi.mock('./lib/anthropic', () => ({ createGenerate: vi.fn() }))

const reply = (text: string): Generation => ({
  text,
  usage: { input_tokens: 1000, output_tokens: 500 },
  stopReason: 'end_turn',
})

const keyStore: KeyStore = {
  load: async () => 'sk-ant-test',
  save: async () => {},
  forget: async () => {},
}

const generateWith = (...replies: Generation[]): ReturnType<typeof vi.fn> => {
  const generate = vi.fn(async (request: { user: string }) => {
    const next = replies.shift()
    if (!next) throw new Error('unexpected extra turn')
    return { ...next, sent: request.user }
  })
  vi.mocked(createGenerate).mockReturnValue(generate as unknown as Generate)
  return generate
}

const sunLayer = () =>
  createLayer({
    name: 'Sun',
    svg: '<g id="sun"><circle cx="50" cy="50" r="20" fill="#fc0"/></g>',
    defs: '',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 30, y: 30, width: 40, height: 40 },
  })

const layer = () => useEditor.getState().doc.groups[0]?.layers[0]

beforeEach(() => {
  resetEditor()
  vi.mocked(createGenerate).mockReset()
  useEditor.getState().addGroups([createGroup('Art', [sunLayer()])])
  useEditor.getState().setView({ adjustLayerId: layer()?.id ?? null })
})

afterEach(cleanup)

describe('AdjustDialog', () => {
  it('stays closed until a layer is named', () => {
    useEditor.getState().setView({ adjustLayerId: null })
    render(<AdjustDialog keyStore={keyStore} />)
    expect(screen.queryByText('AI Adjust')).toBeNull()
  })

  it('sends the layer with the instruction and replaces its artwork in place', async () => {
    const before = layer()
    if (!before) throw new Error('no layer')
    const edited = layerDocument(before).replace('r="20"', 'r="40"')
    const generate = generateWith(reply(edited))
    render(<AdjustDialog keyStore={keyStore} />)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('API key saved in this browser')).toBeTruthy())
    await user.type(screen.getByLabelText('What should change?'), 'bigger')
    await user.click(screen.getByRole('button', { name: 'Adjust' }))

    await waitFor(() => expect(useEditor.getState().view.adjustLayerId).toBeNull())
    expect(generate).toHaveBeenCalledTimes(1)
    const request = generate.mock.calls[0]?.[0] as { user: string }
    expect(request.user).toContain('Instruction:\nbigger')
    expect(request.user).toContain(layerDocument(before))

    const after = layer()
    expect(after?.id).toBe(before.id)
    expect(after?.name).toBe('Sun')
    expect(after?.svg).toContain('r="40"')
    expect(after?.bbox).toEqual({ x: 10, y: 10, width: 80, height: 80 })
    expect(after?.transform).toEqual(before.transform)
    expect(useEditor.getState().doc.groups[0]?.layers).toHaveLength(1)
    expect(useEditor.getState().toasts[0]?.message).toMatch(/^Adjusted "Sun" for \$0\.\d\d$/)
  })

  it('lists problems when the budget runs out and can apply anyway', async () => {
    const before = layer()
    if (!before) throw new Error('no layer')
    const texty = layerDocument(before).replace('</g>', '<text x="1" y="1">hi</text></g>')
    const generate = generateWith(reply(texty), reply(texty))
    render(<AdjustDialog keyStore={keyStore} />)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('API key saved in this browser')).toBeTruthy())
    await user.type(screen.getByLabelText('What should change?'), 'label it')
    await user.click(screen.getByRole('button', { name: 'Adjust' }))

    await waitFor(() => expect(screen.getByText('Still not right after every turn')).toBeTruthy())
    expect(generate).toHaveBeenCalledTimes(2)
    expect(screen.getByText(/^Contains live text\./)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Apply anyway' }))
    await waitFor(() => expect(useEditor.getState().view.adjustLayerId).toBeNull())
    expect(layer()?.svg).toContain('<text')
    expect(layer()?.issues.map((i) => i.code)).toEqual(['text'])
    expect(useEditor.getState().toasts[0]?.message).toMatch(/with 1 open issue/)
  })
})
