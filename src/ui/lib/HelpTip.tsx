/** A "?" next to a control that opens the long explanation on click. */
import { Popover } from '@base-ui/react/popover'
import type { ReactNode } from 'react'

export const HelpTip = ({ topic, children }: { topic: string; children: ReactNode }) => (
  <Popover.Root>
    <Popover.Trigger
      aria-label={`About ${topic}`}
      className="flex size-4 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-[10px] leading-none text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
    >
      ?
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Positioner side="bottom" align="start" sideOffset={6}>
        <Popover.Popup className="max-w-72 border border-zinc-300 bg-white px-3 py-2 text-[12px] leading-relaxed text-zinc-700 shadow-lg shadow-black/10">
          <Popover.Title className="mb-1 font-medium text-zinc-900">{topic}</Popover.Title>
          <Popover.Description render={<div />}>{children}</Popover.Description>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>
)
