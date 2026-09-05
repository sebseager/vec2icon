/** Small on/off switch with its own label. */
import { Switch } from '@/components/ui/switch'

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
  <Switch
    size="sm"
    aria-label={label}
    checked={checked}
    disabled={disabled}
    onCheckedChange={onChange}
  />
)
