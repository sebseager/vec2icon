/** One list of actions, drawn as the three-dots dropdown and as the right-click menu alike,
 * so the two can never drift apart. */
import type { ReactNode } from 'react'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

export type MenuEntry =
  | { kind: 'item'; label: string; onClick: () => void; disabled?: boolean }
  | { kind: 'separator' }
  | { kind: 'sub'; label: string; disabled?: boolean; items: MenuEntry[] }

const keyOf = (entry: MenuEntry, index: number): string =>
  entry.kind === 'separator' ? `sep-${index}` : entry.label

export const DropdownEntries = ({ entries }: { entries: MenuEntry[] }): ReactNode =>
  entries.map((entry, index) => {
    const key = keyOf(entry, index)
    if (entry.kind === 'separator') return <DropdownMenuSeparator key={key} />
    if (entry.kind === 'sub') {
      return (
        <DropdownMenuSub key={key}>
          <DropdownMenuSubTrigger className="text-xs" disabled={entry.disabled}>
            {entry.label}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownEntries entries={entry.items} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )
    }
    return (
      <DropdownMenuItem
        key={key}
        className="text-xs"
        disabled={entry.disabled}
        onClick={entry.onClick}
      >
        {entry.label}
      </DropdownMenuItem>
    )
  })

export const ContextEntries = ({ entries }: { entries: MenuEntry[] }): ReactNode =>
  entries.map((entry, index) => {
    const key = keyOf(entry, index)
    if (entry.kind === 'separator') return <ContextMenuSeparator key={key} />
    if (entry.kind === 'sub') {
      return (
        <ContextMenuSub key={key}>
          <ContextMenuSubTrigger className="text-xs" disabled={entry.disabled}>
            {entry.label}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextEntries entries={entry.items} />
          </ContextMenuSubContent>
        </ContextMenuSub>
      )
    }
    return (
      <ContextMenuItem
        key={key}
        className="text-xs"
        disabled={entry.disabled}
        onClick={entry.onClick}
      >
        {entry.label}
      </ContextMenuItem>
    )
  })
