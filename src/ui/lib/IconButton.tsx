/** Square icon button used across the top bar, layer rows and panels. */
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  active?: boolean
  children: ReactNode
}

export const IconButton = ({ label, active, className, children, ...rest }: Props) => (
  <button
    type="button"
    aria-label={label}
    title={rest.title ?? label}
    aria-pressed={active}
    className={`flex size-7 shrink-0 items-center justify-center rounded-[3px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:text-zinc-300 ${
      active ? 'text-accent' : ''
    } ${className ?? ''}`}
    {...rest}
  >
    {children}
  </button>
)
