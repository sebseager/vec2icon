/** Labelled slider with a live readout. Dragging reports every step through
 * `onChange` (callers coalesce those into one undo step) and settles on `onCommit`. */
import { Slider as BaseSlider } from '@base-ui/react/slider'
import type { ReactNode } from 'react'

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
}) => (
  <BaseSlider.Root
    value={value}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    onValueChange={(next) => onChange(first(next))}
    onValueCommitted={(next) => onCommit?.(first(next))}
    className="flex h-7 items-center gap-2"
  >
    <span className="flex w-[4.5rem] shrink-0 items-center gap-1 truncate text-zinc-500">
      <BaseSlider.Label className="truncate">{label}</BaseSlider.Label>
      {help}
    </span>
    <BaseSlider.Control className="flex flex-1 touch-none select-none items-center py-2">
      <BaseSlider.Track className="h-px w-full bg-zinc-300">
        <BaseSlider.Indicator className="bg-accent" />
        <BaseSlider.Thumb
          aria-label={label}
          className="size-2.5 rounded-full border border-zinc-400 bg-white data-[dragging]:border-accent data-[dragging]:bg-accent"
        />
      </BaseSlider.Track>
    </BaseSlider.Control>
    <output className="w-9 shrink-0 text-right text-zinc-600">{format(value)}</output>
  </BaseSlider.Root>
)
