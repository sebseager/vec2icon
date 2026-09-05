/** The dense control row above the canvas: rendition, tint, platform, wallpaper, light. */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Platform, Rendition } from '@/core/model/types'
import type { Renderer } from '@/core/render'
import { useEditor, type Wallpaper } from '@/state'
import { ColorField } from '../lib/ColorField'
import { HelpTip } from '../lib/HelpTip'
import { LightDial } from './LightDial'

/** `short` is what the tab shows; `label` stays its accessible name and tooltip, so the
 * strip still fits beside both side panels at the app's 1024 px minimum width. */
const RENDITIONS: Array<{ value: Rendition; label: string; short: string }> = [
  { value: 'default', label: 'Default', short: 'Default' },
  { value: 'dark', label: 'Dark', short: 'Dark' },
  { value: 'clearLight', label: 'Clear Light', short: 'Clear L' },
  { value: 'clearDark', label: 'Clear Dark', short: 'Clear D' },
  { value: 'tintedLight', label: 'Tinted Light', short: 'Tinted L' },
  { value: 'tintedDark', label: 'Tinted Dark', short: 'Tinted D' },
]

const PLATFORMS: Array<{ value: Platform; label: string }> = [
  { value: 'ios', label: 'iOS' },
  { value: 'macos', label: 'macOS' },
  { value: 'watchos', label: 'watchOS' },
]

const WALLPAPERS: Array<{ value: Wallpaper; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'gradient-blue', label: 'Blue gradient' },
  { value: 'gradient-warm', label: 'Warm gradient' },
  { value: 'checker', label: 'Checker' },
]

const Divider = () => <Separator orientation="vertical" className="self-stretch" />

type Props = {
  /** null until the renderer has been created. */
  rendererKind: Renderer['kind'] | null
}

export const CanvasToolbar = ({ rendererKind }: Props) => {
  const view = useEditor((s) => s.view)
  const setView = useEditor((s) => s.setView)
  const tinted = view.rendition === 'tintedLight' || view.rendition === 'tintedDark'
  const flat = rendererKind === 'flat'

  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b bg-muted px-2 text-muted-foreground">
      <Tabs
        className="shrink-0"
        value={view.rendition}
        onValueChange={(value) => setView({ rendition: value as Rendition })}
      >
        <TabsList aria-label="Rendition" className="h-7">
          {RENDITIONS.map(({ value, label, short }) => (
            <TabsTrigger
              key={value}
              value={value}
              aria-label={label}
              title={label}
              className="text-xs"
            >
              {short}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tinted && (
        <>
          <Divider />
          <div className="w-28">
            <ColorField
              label="Tint color"
              color={view.tint}
              onChange={(tint) => setView({ tint })}
            />
          </div>
        </>
      )}

      <Divider />

      <ToggleGroup
        aria-label="Platform"
        size="sm"
        variant="outline"
        spacing={0}
        value={[view.platform]}
        onValueChange={(value) => {
          const next = value[0]
          if (next) setView({ platform: next as Platform })
        }}
        className="shrink-0"
      >
        {PLATFORMS.map(({ value, label }) => (
          <ToggleGroupItem key={value} value={value} className="h-6 text-xs">
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Divider />

      <Select
        items={WALLPAPERS}
        value={view.wallpaper}
        onValueChange={(value) => setView({ wallpaper: value as Wallpaper })}
      >
        <SelectTrigger size="sm" className="text-xs data-[size=sm]:h-6" aria-label="Wallpaper">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WALLPAPERS.map(({ value, label }) => (
            <SelectItem key={value} value={value} className="text-xs">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Divider />

      <div className="flex shrink-0 items-center gap-1.5" title="Light angle">
        <LightDial angle={view.lightAngle} onChange={(lightAngle) => setView({ lightAngle })} />
        <span className="w-8 tabular-nums">{Math.round(view.lightAngle)}&deg;</span>
      </div>

      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        <span>{flat ? 'Flat preview (WebGL unavailable)' : 'Approximate preview'}</span>
        <HelpTip topic="Approximate preview">
          Glass, refraction and specular highlights are approximations of Apple&rsquo;s renderer,
          and the iOS 27 generation is not matched. Icon Composer and Xcode are the reference for
          how the icon will really look.
          {flat ? (
            <>
              {' '}
              WebGL2 is unavailable in this browser, so layers are composited flat with a drop
              shadow and no glass at all.
            </>
          ) : null}
        </HelpTip>
      </span>
    </div>
  )
}
