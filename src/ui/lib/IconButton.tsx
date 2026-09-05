/** Square icon button used across the top bar, layer rows and panels. */
import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  label: string
  /** Pressed state, shown in the accent colour. */
  active?: boolean
  size?: 'sm' | 'xs'
  children?: ReactNode
}

export const IconButton = ({ label, active, size = 'sm', className, children, ...rest }: Props) => (
  <Button
    variant="ghost"
    size={size === 'sm' ? 'icon-sm' : 'icon-xs'}
    aria-label={label}
    title={rest.title ?? label}
    aria-pressed={active}
    className={cn('text-muted-foreground', active && 'text-primary hover:text-primary', className)}
    {...rest}
  >
    {children}
  </Button>
)
