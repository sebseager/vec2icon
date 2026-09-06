import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Generate, Generation } from '@/core/compose'
import { useEditor } from '@/state'
import { resetEditor } from '@/ui/test-utils'
import { ComposeDialog } from './ComposeDialog'
import { createGenerate } from './lib/anthropic'
import type { KeyStore } from './lib/keyStorage'

vi.mock('./lib/anthropic', () => ({ createGenerate: vi.fn() }))

const wrap = (body: string, viewBox = '0 0 1024 1024'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`

const GOOD = wrap(
  '<title>Sun Icon</title><g id="background"><rect x="0" y="0" width="1024" height="1024" fill="#4a90c4"/></g><g id="sun"><circle cx="512" cy="512" r="200" fill="#ffc53d"/></g>',
)
const BAD = wrap(
  '<title>Tiny</title><g id="a"><circle cx="5" cy="5" r="1" fill="#000"/></g>',
  '0 0 10 10',
)

const reply = (text: string): Generation => ({
  text,
  usage: { input_tokens: 1000, output_tokens: 500 },
  stopReason: 'end_turn',
})

const memoryKeyStore = (initial: string | null = null): KeyStore & { key: string | null } => {
  const store = {
    key: initial,
    load: async () => store.key,
    save: async (key: string) => {
      store.key = key
    },
    forget: async () => {
      store.key = null
    },
  }
  return store
}

const generateWith = (...replies: Generation[]): ReturnType<typeof vi.fn> => {
  const generate = vi.fn(async () => {
    const next = replies.shift()
    if (!next) throw new Error('unexpected extra turn')
    return next
  })
  vi.mocked(createGenerate).mockReturnValue(generate as unknown as Generate)
  return generate
}

const openDialog = () => useEditor.getState().setView({ composeOpen: true })

beforeEach(() => {
  resetEditor()
  vi.mocked(createGenerate).mockReset()
  openDialog()
})

afterEach(cleanup)

describe('ComposeDialog', () => {
  it('stays closed until the view asks for it', () => {
    useEditor.getState().setView({ composeOpen: false })
    render(<ComposeDialog keyStore={memoryKeyStore()} />)
    expect(screen.queryByText('AI Compose')).toBeNull()
  })

  it('asks for a key first, stores it, and only then allows composing', async () => {
    const store = memoryKeyStore()
    render(<ComposeDialog keyStore={store} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('What should the icon show?'), 'a sun')
    expect(screen.getByRole('button', { name: 'Compose' })).toHaveProperty('disabled', true)

    await user.type(screen.getByLabelText('Anthropic API key'), 'sk-ant-test')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(store.key).toBe('sk-ant-test')
    expect(screen.getByText('API key saved in this browser')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compose' })).toHaveProperty('disabled', false)

    await user.click(screen.getByRole('button', { name: 'Forget' }))
    expect(store.key).toBeNull()
    expect(screen.getByRole('button', { name: 'Compose' })).toHaveProperty('disabled', true)
  })

  it('shows a cost bound that follows the fix budget', async () => {
    render(<ComposeDialog keyStore={memoryKeyStore('sk-ant-test')} />)
    const user = userEvent.setup()
    const readBound = () =>
      Number.parseFloat((screen.getByText(/Costs at most/).textContent ?? '').replace(/^.*\$/, ''))
    const withOneFix = readBound()
    expect(withOneFix).toBeGreaterThan(0)

    await user.click(screen.getByRole('switch', { name: 'Fix rejected output automatically' }))
    const withoutFix = readBound()
    expect(withoutFix).toBeLessThan(withOneFix)
    expect(screen.getByLabelText('Extra turns, at most')).toHaveProperty('disabled', true)

    await user.click(screen.getByRole('switch', { name: 'Fix rejected output automatically' }))
    const turns = screen.getByLabelText('Extra turns, at most')
    await user.clear(turns)
    await user.type(turns, '3')
    expect(readBound()).toBeGreaterThan(withOneFix)
  })

  it('imports the composed icon with its background as the document fill', async () => {
    const generate = generateWith(reply(GOOD))
    render(<ComposeDialog keyStore={memoryKeyStore('sk-ant-test')} />)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('API key saved in this browser')).toBeTruthy())
    await user.type(screen.getByLabelText('What should the icon show?'), 'a sun')
    await user.click(screen.getByRole('button', { name: 'Compose' }))

    await waitFor(() => expect(useEditor.getState().view.composeOpen).toBe(false))
    expect(createGenerate).toHaveBeenCalledWith('sk-ant-test')
    expect(generate).toHaveBeenCalledTimes(1)
    const { doc, toasts } = useEditor.getState()
    expect(doc.name).toBe('Sun Icon')
    expect(doc.groups.map((g) => g.name)).toEqual(['Sun Icon'])
    expect(doc.groups[0]?.layers.map((l) => l.name)).toEqual(['sun'])
    expect(doc.fill.default).toMatchObject({ kind: 'solid' })
    expect(toasts[0]?.message).toMatch(/^Composed "Sun Icon" for \$0\.\d\d$/)
  })

  it('lists the problems after the budget runs out and can import anyway', async () => {
    const generate = generateWith(reply(BAD), reply(BAD))
    render(<ComposeDialog keyStore={memoryKeyStore('sk-ant-test')} />)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('API key saved in this browser')).toBeTruthy())
    await user.type(screen.getByLabelText('What should the icon show?'), 'a dot')
    await user.click(screen.getByRole('button', { name: 'Compose' }))

    await waitFor(() => expect(screen.getByText('Still not right after every turn')).toBeTruthy())
    expect(generate).toHaveBeenCalledTimes(2)
    expect(screen.getByText('The viewBox must be "0 0 1024 1024".')).toBeTruthy()
    expect(screen.getByText(/^Spent \$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Import anyway' }))
    await waitFor(() => expect(useEditor.getState().view.composeOpen).toBe(false))
    const { doc, toasts } = useEditor.getState()
    expect(doc.groups[0]?.layers.map((l) => l.name)).toEqual(['a'])
    expect(toasts[0]?.message).toMatch(/with 1 open issue/)
  })

  it('reports an API failure as a toast and returns to idle', async () => {
    vi.mocked(createGenerate).mockReturnValue(async () => {
      throw new Error('Anthropic rejected the API key.')
    })
    render(<ComposeDialog keyStore={memoryKeyStore('sk-ant-test')} />)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('API key saved in this browser')).toBeTruthy())
    await user.type(screen.getByLabelText('What should the icon show?'), 'a dot')
    await user.click(screen.getByRole('button', { name: 'Compose' }))

    await waitFor(() =>
      expect(useEditor.getState().toasts[0]?.message).toBe(
        'Request failed: Anthropic rejected the API key.',
      ),
    )
    expect(screen.getByRole('button', { name: 'Compose' })).toHaveProperty('disabled', false)
    expect(useEditor.getState().doc.groups).toEqual([])
  })

  it('cancelling a run aborts it and imports nothing', async () => {
    const gate: { release: (() => void) | null } = { release: null }
    const generate = vi.fn(
      (_request: unknown, signal?: AbortSignal) =>
        new Promise<Generation>((resolve, reject) => {
          gate.release = () => resolve(reply(GOOD))
          signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    vi.mocked(createGenerate).mockReturnValue(generate as unknown as Generate)
    render(<ComposeDialog keyStore={memoryKeyStore('sk-ant-test')} />)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByText('API key saved in this browser')).toBeTruthy())
    await user.type(screen.getByLabelText('What should the icon show?'), 'a sun')
    await user.click(screen.getByRole('button', { name: 'Compose' }))
    await waitFor(() => expect(screen.getByText('Working…')).toBeTruthy())

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Compose' })).toHaveProperty('disabled', false)
    gate.release?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(useEditor.getState().doc.groups).toEqual([])
    expect(useEditor.getState().toasts).toEqual([])
  })
})
