/** Text input that commits on Enter or blur, not on every keystroke. Escape reverts. */
import { type KeyboardEvent, useEffect, useState } from 'react'

export const TextField = ({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (value: string) => void
}) => {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const commit = (): void => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== value) onCommit(next)
    else setDraft(value)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') e.currentTarget.blur()
    else if (e.key === 'Escape') {
      setDraft(value)
      setEditing(false)
      e.currentTarget.blur()
    }
  }

  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(e) => {
        setEditing(true)
        setDraft(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="h-6 min-w-0 flex-1 rounded-[3px] border border-zinc-300 bg-white px-1.5 text-[12px] text-zinc-800 outline-none focus:border-accent"
    />
  )
}
