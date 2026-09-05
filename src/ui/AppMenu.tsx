/** The overflow menu at the end of the top bar: theme, then help. */
import { Ellipsis, Monitor, Moon, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useEditor } from '@/state'
import { IconButton } from './lib/IconButton'
import { type ThemeChoice, useTheme } from './theme/ThemeProvider'

const THEMES: readonly { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

export const AppMenu = () => {
  const { theme, setTheme } = useTheme()
  const setView = useEditor((s) => s.setView)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label="More" />}>
        <Ellipsis size={15} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 text-xs">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeChoice)}
        >
          <DropdownMenuLabel>Appearance</DropdownMenuLabel>
          {THEMES.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick className="text-xs">
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs" onClick={() => setView({ helpOpen: true })}>
          Help
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
