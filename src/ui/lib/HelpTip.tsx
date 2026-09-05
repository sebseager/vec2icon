/** A "?" next to a control that opens the long explanation on click. */
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

export const HelpTip = ({ topic, children }: { topic: string; children: ReactNode }) => (
  <Popover>
    <PopoverTrigger
      render={
        <Button
          variant="outline"
          size="icon-xs"
          aria-label={`About ${topic}`}
          className="size-4 rounded-full text-[10px] text-muted-foreground"
        />
      }
    >
      ?
    </PopoverTrigger>
    <PopoverContent side="bottom" align="start" sideOffset={6} className="w-72 text-xs">
      <PopoverHeader>
        <PopoverTitle className="text-foreground">{topic}</PopoverTitle>
        <PopoverDescription render={<div />} className="leading-relaxed">
          {children}
        </PopoverDescription>
      </PopoverHeader>
    </PopoverContent>
  </Popover>
)
