/** Number input that commits on Enter or blur, not on every keystroke. Escape reverts. */
import { type KeyboardEvent, useEffect, useState } from 'react'

export const NumberField = ({
  label,
  value,
  onCommit,
  step = 1,
  suffix,
  disabled,
}: {
  label: string
  value: number
  onCommit: (value: number) => void
  step?: number
  suffix?: string
  disabled?: boolean
}) => {
  const shown = String(Math.round(value * 100) / 100)
  const [draft, setDraft] = useState(shown)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(shown)
  }, [shown, editing])

  const commit = (): void => {
    setEditing(false)
    const parsed = Number.parseFloat(draft)
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed)
    else setDraft(shown)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setDraft(shown)
      setEditing(false)
      e.currentTarget.blur()
    }
  }

  return (
    <label className="flex h-6 min-w-0 flex-1 items-center rounded-[3px] border border-zinc-300 bg-white px-1.5 focus-within:border-accent">
      <input
        aria-label={label}
        type="number"
        inputMode="decimal"
        step={step}
        disabled={disabled}
        value={draft}
        onChange={(e) => {
          setEditing(true)
          setDraft(e.target.value)
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className="w-full min-w-0 bg-transparent text-[12px] text-zinc-800 outline-none"
      />
      {suffix ? <span className="pl-1 text-zinc-500">{suffix}</span> : null}
    </label>
  )
}
