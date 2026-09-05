/** Labelled slider with a live readout. Dragging reports every step through
 * `onChange` (callers coalesce those into one undo step) and settles on `onCommit`. */
import { type ReactNode, useId } from 'react'
import { Slider as BaseSlider } from '@/components/ui/slider'

const first = (value: number | readonly number[]): number =>
  typeof value === 'number' ? value : (value[0] ?? 0)

export const Slider = ({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  format = (n) => `${Math.round(n * 100)}%`,
  onChange,
  onCommit,
  help,
  disabled,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  format?: (value: number) => string
  onChange: (value: number) => void
  onCommit?: (value: number) => void
  help?: ReactNode
  disabled?: boolean
}) => {
  const labelId = useId()
  return (
    <div className="flex h-7 items-center gap-2">
      <span className="flex w-[4.5rem] shrink-0 items-center gap-1 truncate text-muted-foreground">
        <span id={labelId} className="truncate">
          {label}
        </span>
        {help}
      </span>
      <BaseSlider
        aria-labelledby={labelId}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={(next) => onChange(first(next))}
        onValueCommitted={(next) => onCommit?.(first(next))}
        className="min-w-0 flex-1"
      />
      <output aria-hidden="true" className="w-9 shrink-0 text-right text-muted-foreground">
        {format(value)}
      </output>
    </div>
  )
}
