/** The dense control row above the canvas: rendition, tint, platform, wallpaper, light. */
import { Select } from '@base-ui/react/select'
import { Tabs } from '@base-ui/react/tabs'
import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { Tooltip } from '@base-ui/react/tooltip'
import type { Platform, Rendition } from '@/core/model/types'
import type { Renderer } from '@/core/render'
import { useEditor, type Wallpaper } from '@/state'
import { LightDial } from './LightDial'
import { colorToHex, hexToColor } from './lib/color'

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

const Divider = () => <span aria-hidden="true" className="h-4 w-px shrink-0 bg-zinc-200" />

const tabClass =
  'h-6 shrink-0 rounded px-2 text-[12px] leading-6 text-zinc-500 outline-none select-none hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40 data-[active]:bg-white data-[active]:text-zinc-900 data-[active]:shadow-[0_0_0_1px_rgb(228_228_231),0_1px_1px_rgb(0_0_0/0.04)]'

const toggleClass =
  'h-6 shrink-0 rounded px-2 text-[12px] leading-6 text-zinc-500 outline-none select-none hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40 data-[pressed]:bg-white data-[pressed]:text-zinc-900 data-[pressed]:shadow-[0_0_0_1px_rgb(228_228_231),0_1px_1px_rgb(0_0_0/0.04)]'

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
    <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-zinc-200 bg-zinc-50 px-2 py-1 text-[12px] text-zinc-600">
      <Tabs.Root
        className="shrink-0"
        value={view.rendition}
        onValueChange={(value) => setView({ rendition: value as Rendition })}
      >
        <Tabs.List aria-label="Rendition" className="flex shrink-0 items-center gap-0.5">
          {RENDITIONS.map(({ value, label, short }) => (
            <Tabs.Tab
              key={value}
              value={value}
              aria-label={label}
              title={label}
              className={tabClass}
            >
              {short}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {tinted && (
        <>
          <Divider />
          <input
            type="color"
            aria-label="Tint color"
            value={colorToHex(view.tint)}
            onChange={(e) =>
              setView({ tint: hexToColor(e.target.value, view.tint.components[3] ?? 1) })
            }
            className="h-5 w-7 shrink-0 cursor-pointer rounded border border-zinc-300 bg-white p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40"
          />
        </>
      )}

      <Divider />

      <ToggleGroup
        aria-label="Platform"
        value={[view.platform]}
        onValueChange={(value) => {
          const next = value[0]
          if (next) setView({ platform: next as Platform })
        }}
        className="flex shrink-0 items-center gap-0.5"
      >
        {PLATFORMS.map(({ value, label }) => (
          <Toggle key={value} value={value} className={toggleClass}>
            {label}
          </Toggle>
        ))}
      </ToggleGroup>

      <Divider />

      <Select.Root
        items={WALLPAPERS}
        value={view.wallpaper}
        onValueChange={(value) => setView({ wallpaper: value as Wallpaper })}
      >
        <Select.Trigger
          aria-label="Wallpaper"
          className="flex h-6 shrink-0 items-center gap-1.5 rounded border border-zinc-300 bg-white px-2 text-[12px] text-zinc-700 outline-none select-none hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40"
        >
          <Select.Value />
          <Select.Icon className="text-zinc-400">
            <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
              <path d="M0 0h8L4 5z" fill="currentColor" />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={4} className="z-30 outline-none">
            <Select.Popup className="min-w-[var(--anchor-width)] rounded border border-zinc-200 bg-white py-1 text-[12px] text-zinc-700 shadow-lg shadow-black/10 outline-none">
              {WALLPAPERS.map(({ value, label }) => (
                <Select.Item
                  key={value}
                  value={value}
                  className="cursor-default px-2.5 py-1 outline-none select-none data-[highlighted]:bg-[#0a84ff] data-[highlighted]:text-white"
                >
                  <Select.ItemText>{label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>

      <Divider />

      <div className="flex shrink-0 items-center gap-1.5" title="Light angle">
        <LightDial angle={view.lightAngle} onChange={(lightAngle) => setView({ lightAngle })} />
        <span className="w-8 tabular-nums text-zinc-500">{Math.round(view.lightAngle)}&deg;</span>
      </div>

      <Tooltip.Provider delay={150}>
        <Tooltip.Root>
          <Tooltip.Trigger className="ml-auto shrink-0 cursor-help rounded px-1 text-[12px] text-zinc-400 underline decoration-dotted underline-offset-4 outline-none hover:text-zinc-700 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40">
            {flat ? 'Flat preview (WebGL unavailable)' : 'Approximate preview'}
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Positioner sideOffset={8} align="end" className="z-30">
              <Tooltip.Popup className="max-w-[19rem] rounded border border-zinc-200 bg-white p-3 text-[12px] leading-relaxed text-zinc-600 shadow-lg shadow-black/10">
                <p className="mb-1.5 font-medium text-zinc-900">What you see here is an estimate</p>
                <p>
                  Glass, refraction and specular highlights are approximations of Apple&rsquo;s
                  renderer, and the iOS 27 generation is not matched. Icon Composer and Xcode are
                  the reference for how the icon will really look.
                </p>
                {flat && (
                  <p className="mt-1.5">
                    WebGL2 is unavailable in this browser, so layers are composited flat with a drop
                    shadow and no glass at all.
                  </p>
                )}
              </Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    </div>
  )
}
