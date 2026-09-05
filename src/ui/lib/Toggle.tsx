/** Small on/off switch with its own label. */
import { Switch } from '@base-ui/react/switch'

export const Toggle = ({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) => (
  <Switch.Root
    aria-label={label}
    checked={checked}
    disabled={disabled}
    onCheckedChange={onChange}
    className="relative h-4 w-7 shrink-0 rounded-full border border-zinc-300 bg-zinc-200 data-[checked]:border-accent data-[checked]:bg-accent"
  >
    <Switch.Thumb className="block size-3 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-3.5" />
  </Switch.Root>
)
