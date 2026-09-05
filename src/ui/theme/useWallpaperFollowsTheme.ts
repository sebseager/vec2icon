/** Keeps the plain Light/Dark wallpaper in step with the app theme. A gradient or
 * checker wallpaper is a deliberate choice and is left alone. */
import { useTheme as useNextTheme } from 'next-themes'
import { useEffect } from 'react'
import { useEditor } from '@/state'

export const useWallpaperFollowsTheme = (): void => {
  const { resolvedTheme } = useNextTheme()
  useEffect(() => {
    if (resolvedTheme !== 'light' && resolvedTheme !== 'dark') return
    const { view, setView } = useEditor.getState()
    if (
      (view.wallpaper === 'light' || view.wallpaper === 'dark') &&
      view.wallpaper !== resolvedTheme
    ) {
      setView({ wallpaper: resolvedTheme })
    }
  }, [resolvedTheme])
}
