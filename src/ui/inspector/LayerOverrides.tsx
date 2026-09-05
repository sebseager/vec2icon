/** The Dark and Mono deltas on top of a layer's Default values. */
import { setLayerOverride as setLayerOverrideOp } from '@/core/model/ops'
import type { Appearance, BlendMode, Fill, Layer, LayerOverride } from '@/core/model/types'
import { useEditor } from '@/state'
import { ColorField } from '../lib/ColorField'
import { alphaOf, grayColor, grayLevel, toGrayColor, toSrgbColor, withAlpha } from '../lib/color'
import { Field, Section, SwitchRow } from '../lib/Field'
import { HelpTip } from '../lib/HelpTip'
import { BLEND_MODE_OPTIONS } from '../lib/options'
import { type Option, Select } from '../lib/Select'
import { Slider } from '../lib/Slider'

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
          <ColorField
            label="Override color"
            color={color}
            onChange={(next) => live({ fill: { kind: 'solid', color: next } })}
          />
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

      {kind === 'gray' ? (
        <Slider
          label="Alpha"
          value={alphaOf(color)}
          onChange={(alpha) => live({ fill: { kind: 'solid', color: withAlpha(color, alpha) } })}
        />
      ) : null}

      <SwitchRow
        label="Opacity"
        name="Override opacity"
        checked={override.opacity !== undefined}
        onChange={(on) => set({ opacity: on ? layer.opacity : undefined })}
      />
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
