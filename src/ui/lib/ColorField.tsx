/** A swatch that opens a colour picker with hue, saturation, alpha and an editable hex
 * field. Every change reports live through `onChange`; `onCommit` fires when the popover
 * closes so callers can end a coalesced history step. */
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { HexAlphaColorPicker } from 'react-colorful'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { hexToColor } from '@/core/export/color'
import type { Color } from '@/core/model/types'
import { cn } from '@/lib/utils'
import { alphaOf, colorToHex, colorToHex8, withAlpha } from './color'

const CHECKER =
  'linear-gradient(45deg, rgb(0 0 0 / 0.15) 25%, transparent 25%, transparent 75%, rgb(0 0 0 / 0.15) 75%), linear-gradient(45deg, rgb(0 0 0 / 0.15) 25%, transparent 25%, transparent 75%, rgb(0 0 0 / 0.15) 75%)'

const HexInput = ({ color, onChange }: { color: Color; onChange: (color: Color) => void }) => {
  const shown = colorToHex8(color)
  const [draft, setDraft] = useState(shown)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(shown)
  }, [shown, editing])

  const commit = (): void => {
    setEditing(false)
    const parsed = hexToColor(draft)
    const digits = draft.trim().replace(/^#/, '')
    if (!parsed) {
      setDraft(shown)
      return
    }
    // A 6-digit entry keeps the alpha the colour already had.
    onChange(digits.length === 8 ? parsed : withAlpha(parsed, alphaOf(color)))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') e.currentTarget.blur()
    else if (e.key === 'Escape') {
      setDraft(shown)
      setEditing(false)
      e.currentTarget.blur()
    }
  }

  return (
    <Input
      aria-label="Hex"
      spellCheck={false}
      value={draft}
      onChange={(e) => {
        setEditing(true)
        setDraft(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="h-6 rounded-md px-1.5 font-mono text-xs uppercase md:text-xs"
    />
  )
}

export const Swatch = ({ color, className }: { color: Color; className?: string }) => (
  <span
    aria-hidden="true"
    className={cn('relative block size-4 shrink-0 overflow-hidden rounded-sm', className)}
    style={{
      backgroundImage: CHECKER,
      backgroundSize: '8px 8px',
      backgroundPosition: '0 0, 4px 4px',
      backgroundColor: 'white',
    }}
  >
    <span className="absolute inset-0" style={{ backgroundColor: colorToHex8(color) }} />
  </span>
)

export const ColorField = ({
  label,
  color,
  onChange,
  onCommit,
  disabled,
}: {
  label: string
  color: Color
  onChange: (color: Color) => void
  onCommit?: () => void
  disabled?: boolean
}) => {
  const [open, setOpen] = useState(false)
  // Base UI can report one close more than once (escape, then focus leaving); commit once.
  const wasOpen = useRef(false)
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next === wasOpen.current) return
        wasOpen.current = next
        if (!next) onCommit?.()
      }}
    >
      <PopoverTrigger
        aria-label={label}
        disabled={disabled}
        className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-input px-1.5 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-expanded:bg-muted dark:bg-input/30"
      >
        <Swatch color={color} className="border border-border" />
        <span className="truncate font-mono text-xs uppercase">{colorToHex(color)}</span>
        {alphaOf(color) < 1 ? (
          <span className="ml-auto shrink-0 text-muted-foreground">
            {Math.round(alphaOf(color) * 100)}%
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" sideOffset={4} className="w-56 gap-2 p-2">
        <HexAlphaColorPicker
          color={colorToHex8(color)}
          onChange={(hex) => {
            const next = hexToColor(hex)
            if (next) onChange(next)
          }}
        />
        <div className="flex items-center gap-2">
          <HexInput color={color} onChange={onChange} />
          <span className="w-9 shrink-0 text-right text-muted-foreground">
            {Math.round(alphaOf(color) * 100)}%
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
