/** The Dark and Mono deltas on top of a layer's Default values. */
import { setLayerOverride as setLayerOverrideOp } from '@/core/model/ops'
import type { Appearance, BlendMode, Fill, Layer, LayerOverride } from '@/core/model/types'
import { useEditor } from '@/state'
import {
  alphaOf,
  colorToHex,
  grayColor,
  grayLevel,
  solidColor,
  toGrayColor,
  toSrgbColor,
  withAlpha,
} from '../lib/color'
import { Field, Section } from '../lib/Field'
import { HelpTip } from '../lib/HelpTip'
import { BLEND_MODE_OPTIONS } from '../lib/options'
import { type Option, Select } from '../lib/Select'
import { Slider } from '../lib/Slider'
import { Toggle } from '../lib/Toggle'

type FillKind = 'inherit' | 'solid' | 'gray'
const FILL_OPTIONS: readonly Option<FillKind>[] = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'solid', label: 'Solid' },
  { value: 'gray', label: 'Gray' },
]

type HiddenKind = 'inherit' | 'hidden' | 'visible'
const HIDDEN_OPTIONS: readonly Option<HiddenKind>[] = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'visible', label: 'Visible' },
]

const BLEND_OPTIONS: readonly Option<BlendMode | 'inherit'>[] = [
  { value: 'inherit', label: 'Inherit' },
  ...BLEND_MODE_OPTIONS,
]

const fillKind = (fill: Fill | undefined): FillKind => {
  if (fill === undefined) return 'inherit'
  if (fill.kind !== 'solid') return 'solid'
  return fill.color.space === 'gray' ? 'gray' : 'solid'
}

const overrideFillColor = (fill: Fill | undefined) =>
  fill && fill.kind === 'solid' ? fill.color : { space: 'srgb' as const, components: [1, 1, 1, 1] }

export const LayerOverrides = ({
  layer,
  appearance,
}: {
  layer: Layer
  appearance: Exclude<Appearance, 'default'>
}) => {
  const setLayerOverride = useEditor((s) => s.setLayerOverride)
  const commitCoalesced = useEditor((s) => s.commitCoalesced)
  const override: LayerOverride = layer.overrides[appearance] ?? {}

  const set = (patch: Partial<LayerOverride>): void => setLayerOverride(layer.id, appearance, patch)
  const live = (patch: Partial<LayerOverride>): void =>
    commitCoalesced((doc) => setLayerOverrideOp(doc, layer.id, appearance, patch))

  const color = overrideFillColor(override.fill)
  const kind = fillKind(override.fill)

  return (
    <Section
      title={`${appearance === 'dark' ? 'Dark' : 'Mono'} override`}
      help={
        <HelpTip topic="Overrides">
          Values set here replace the layer's Default ones in this appearance only. Mono also drives
          the Clear and Tinted renditions.
        </HelpTip>
      }
    >
      <Field label="Fill">
        <Select
          label="Override fill"
          value={kind}
          options={FILL_OPTIONS}
          onChange={(next) =>
            set({
              fill:
                next === 'inherit'
                  ? undefined
                  : {
                      kind: 'solid',
                      color: next === 'gray' ? toGrayColor(color) : toSrgbColor(color),
                    },
            })
          }
        />
      </Field>

      {kind === 'solid' ? (
        <Field label="Color">
          <input
            type="color"
            aria-label="Override color"
            value={colorToHex(color)}
            onChange={(e) =>
              live({ fill: { kind: 'solid', color: solidColor(e.target.value, alphaOf(color)) } })
            }
            className="h-6 w-10 shrink-0 rounded-[3px] border border-zinc-300 bg-white"
          />
          <span className="truncate text-zinc-500">{colorToHex(color)}</span>
        </Field>
      ) : null}

      {kind === 'gray' ? (
        <Slider
          label="White"
          value={grayLevel(color)}
          onChange={(level) =>
            live({ fill: { kind: 'solid', color: grayColor(level, alphaOf(color)) } })
          }
        />
      ) : null}

      {kind === 'inherit' ? null : (
        <Slider
          label="Alpha"
          value={alphaOf(color)}
          onChange={(alpha) => live({ fill: { kind: 'solid', color: withAlpha(color, alpha) } })}
        />
      )}

      <Field label="Opacity">
        <Toggle
          label="Override opacity"
          checked={override.opacity !== undefined}
          onChange={(on) => set({ opacity: on ? layer.opacity : undefined })}
        />
      </Field>
      {override.opacity !== undefined ? (
        <Slider
          label="Opacity"
          value={override.opacity}
          onChange={(opacity) => live({ opacity })}
        />
      ) : null}

      <Field label="Hidden">
        <Select
          label="Override hidden"
          value={override.hidden === undefined ? 'inherit' : override.hidden ? 'hidden' : 'visible'}
          options={HIDDEN_OPTIONS}
          onChange={(next) => set({ hidden: next === 'inherit' ? undefined : next === 'hidden' })}
        />
      </Field>

      <Field label="Blend">
        <Select
          label="Override blend mode"
          value={override.blendMode ?? 'inherit'}
          options={BLEND_OPTIONS}
          onChange={(next) => set({ blendMode: next === 'inherit' ? undefined : next })}
        />
      </Field>
    </Section>
  )
}
