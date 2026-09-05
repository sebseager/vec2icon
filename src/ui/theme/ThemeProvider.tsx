/** System-following light/dark theme with a persisted override. next-themes puts
 * `light` or `dark` on <html>; every token in index.css keys off that class. */
import { ThemeProvider as NextThemes, useTheme as useNextTheme } from 'next-themes'
import type { ReactNode } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'vec2icon-theme'

export const ThemeProvider = ({ children }: { children: ReactNode }) => (
  <NextThemes
    attribute="class"
    defaultTheme="system"
    enableSystem
    storageKey={THEME_STORAGE_KEY}
    disableTransitionOnChange
  >
    {children}
  </NextThemes>
)

export const useTheme = (): { theme: ThemeChoice; setTheme: (theme: ThemeChoice) => void } => {
  const { theme, setTheme } = useNextTheme()
  return { theme: (theme as ThemeChoice | undefined) ?? 'system', setTheme }
}
