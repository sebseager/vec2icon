/** Compact select. Native on purpose: a dense inspector wants the platform's own
 * keyboard handling and list virtualization, and it stays usable at 12px. */
import type { ChangeEvent } from 'react'

export type Option<T extends string> = { value: T; label: string }

export const Select = <T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (value: T) => void
  disabled?: boolean
}) => (
  <select
    aria-label={label}
    value={value}
    disabled={disabled}
    onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}
    className="h-6 min-w-0 flex-1 rounded-[3px] border border-zinc-300 bg-white px-1.5 text-[12px] text-zinc-800 disabled:text-zinc-400"
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
)
