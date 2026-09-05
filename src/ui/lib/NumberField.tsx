/** Number input that commits on Enter or blur, not on every keystroke. Escape reverts. */
import { type KeyboardEvent, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

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
    <div className="relative min-w-0 flex-1">
      <Input
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
        className={`h-6 rounded-md px-1.5 text-xs [appearance:textfield] md:text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${suffix ? 'pr-5' : ''}`}
      />
      {suffix ? (
        <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}
