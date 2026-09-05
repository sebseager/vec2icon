import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Color } from '@/core/model/types'
import { ColorField } from './ColorField'

const RED: Color = { space: 'srgb', components: [1, 0, 0, 1] }

afterEach(cleanup)

describe('ColorField', () => {
  it('shows the hex on its trigger and opens a picker with a hex field', async () => {
    const user = userEvent.setup()
    render(<ColorField label="Tint color" color={RED} onChange={() => {}} />)

    const trigger = screen.getByRole('button', { name: 'Tint color' })
    expect(trigger.textContent).toContain('#ff0000')

    await user.click(trigger)
    expect(screen.getByLabelText('Hex')).toBeTruthy()
  })

  it('commits a typed 6-digit hex on Enter, keeping the existing alpha', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const half: Color = { space: 'srgb', components: [1, 0, 0, 0.5] }
    render(<ColorField label="Color" color={half} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Color' }))
    const hex = screen.getByLabelText('Hex')
    await user.clear(hex)
    await user.type(hex, '00ff00{Enter}')

    expect(onChange).toHaveBeenLastCalledWith({ space: 'srgb', components: [0, 1, 0, 0.5] })
  })

  it('takes alpha from an 8-digit hex', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorField label="Color" color={RED} onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Color' }))
    const hex = screen.getByLabelText('Hex')
    await user.clear(hex)
    await user.type(hex, '#0000ff80{Enter}')

    const color = onChange.mock.lastCall?.[0] as Color
    expect(color.components.slice(0, 3)).toEqual([0, 0, 1])
    expect(color.components[3]).toBeCloseTo(128 / 255, 5)
  })

  it('reverts junk on blur and fires onCommit when the popover closes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(<ColorField label="Color" color={RED} onChange={onChange} onCommit={onCommit} />)

    await user.click(screen.getByRole('button', { name: 'Color' }))
    const hex = screen.getByLabelText<HTMLInputElement>('Hex')
    await user.clear(hex)
    await user.type(hex, 'nope')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(hex.value).toBe('#ff0000ff')

    await user.keyboard('{Escape}')
    expect(onCommit).toHaveBeenCalledTimes(1)
  })
})
