/** Compact select. Native on purpose: a dense inspector wants the platform's own
 * keyboard handling and list virtualization, and it stays usable at 12px. */
import type { ChangeEvent } from 'react'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

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
  <NativeSelect
    size="sm"
    className="min-w-0 flex-1 *:data-[slot=native-select]:h-6 *:data-[slot=native-select]:pl-1.5 *:data-[slot=native-select]:text-xs"
    aria-label={label}
    value={value}
    disabled={disabled}
    onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as T)}
  >
    {options.map((option) => (
      <NativeSelectOption key={option.value} value={option.value}>
        {option.label}
      </NativeSelectOption>
    ))}
  </NativeSelect>
)
