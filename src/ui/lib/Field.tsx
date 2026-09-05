/** The two shapes every inspector control sits in: a labelled row, and a titled block. */
import type { ReactNode } from 'react'
import { Toggle } from './Toggle'

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex h-7 items-center gap-2">
    <span className="w-[4.5rem] shrink-0 truncate text-muted-foreground">{label}</span>
    <div className="flex min-w-0 flex-1 items-center gap-1.5">{children}</div>
  </div>
)

export const Section = ({
  title,
  help,
  children,
}: {
  title: string
  help?: ReactNode
  children: ReactNode
}) => (
  <section className="border-t px-3 py-2 first:border-t-0">
    <header className="flex h-6 items-center gap-1.5 text-[11px] text-muted-foreground">
      <h2 className="font-medium">{title}</h2>
      {help}
    </header>
    <div className="mt-0.5">{children}</div>
  </section>
)

/** A labelled on/off row: the label runs the full width, the help sits just left of
 * the switch, and the switch is pinned to the right edge. */
export const SwitchRow = ({
  label,
  name,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string
  /** Accessible name when it should say more than the visible label. */
  name?: string
  help?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) => (
  <div className="flex h-7 items-center gap-2">
    <span className="min-w-0 flex-1 truncate text-muted-foreground">{label}</span>
    {help}
    <Toggle label={name ?? label} checked={checked} onChange={onChange} disabled={disabled} />
  </div>
)
