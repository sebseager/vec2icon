/** Shown when a group is selected: the glass material the whole group shares. */
import { X } from 'lucide-react'
import { setGlass as setGlassOp, updateGroup as updateGroupOp } from '@/core/model/ops'
import type { BlendMode, Glass, Group } from '@/core/model/types'
import { useEditor } from '@/state'
import { Field, Section, SwitchRow } from '../lib/Field'
import { HelpTip } from '../lib/HelpTip'
import { IconButton } from '../lib/IconButton'
import { BLEND_MODE_OPTIONS } from '../lib/options'
import { type Option, Select } from '../lib/Select'
import { Slider } from '../lib/Slider'

const LIGHTING_OPTIONS: readonly Option<Glass['lighting']>[] = [
  { value: 'individual', label: 'Individual' },
  { value: 'combined', label: 'Combined' },
]

type Placement = 'automatic' | 'inside' | 'outside'
const PLACEMENT_OPTIONS: readonly Option<Placement>[] = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'inside', label: 'Inside' },
  { value: 'outside', label: 'Outside' },
]

const SHADOW_OPTIONS: readonly Option<Glass['shadow']['kind']>[] = [
  { value: 'neutral', label: 'Neutral' },
  { value: 'layer-color', label: 'Layer color' },
  { value: 'none', label: 'None' },
]

const Ic2Tag = () => (
  <span className="shrink-0 rounded-sm border px-1 text-[10px] text-muted-foreground">
    Xcode 27
  </span>
)

export const GroupInspector = ({ group }: { group: Group }) => {
  const setGlass = useEditor((s) => s.setGlass)
  const updateGroup = useEditor((s) => s.updateGroup)
  const commitCoalesced = useEditor((s) => s.commitCoalesced)

  const glass = group.glass
  const refractivity = glass.refractivity
  const liveGlass = (patch: Partial<Glass>): void =>
    commitCoalesced((doc) => setGlassOp(doc, group.id, patch))
  const liveGroup = (patch: Partial<Group>): void =>
    commitCoalesced((doc) => updateGroupOp(doc, group.id, patch))

  const placement = glass.specularPlacement
  const placementOptions: readonly Option<Placement | ''>[] =
    placement === undefined
      ? [{ value: '', label: 'Not set' }, ...PLACEMENT_OPTIONS]
      : PLACEMENT_OPTIONS

  return (
    <>
      <Section
        title={group.name}
        help={
          <HelpTip topic="Glass">
            Every layer in a group is lit and blurred as one piece of glass. Split artwork across
            groups when parts of it should catch the light separately.
          </HelpTip>
        }
      >
        <Field label="Lighting">
          <Select
            label="Lighting"
            value={glass.lighting}
            options={LIGHTING_OPTIONS}
            onChange={(lighting) => setGlass(group.id, { lighting })}
          />
          <HelpTip topic="Lighting">
            Individual lights each layer on its own. Combined treats the whole group as one solid,
            which keeps highlights continuous across overlapping shapes.
          </HelpTip>
        </Field>

        <SwitchRow
          label="Specular"
          checked={glass.specular}
          onChange={(specular) => setGlass(group.id, { specular })}
        />

        <Field label="Placement">
          <Select
            label="Specular placement"
            value={placement ?? ''}
            options={placementOptions}
            onChange={(next) =>
              setGlass(group.id, { specularPlacement: next === '' ? undefined : next })
            }
          />
          <Ic2Tag />
          {placement !== undefined ? (
            <IconButton
              label="Clear specular placement"
              size="xs"
              onClick={() => setGlass(group.id, { specularPlacement: undefined })}
            >
              <X size={13} aria-hidden="true" />
            </IconButton>
          ) : null}
        </Field>

        <Slider
          label="Blur"
          value={glass.blurMaterial}
          onChange={(blurMaterial) => liveGlass({ blurMaterial })}
          help={
            <HelpTip topic="Blur material">
              How much the glass frosts what sits behind it, from clear to fully diffused.
            </HelpTip>
          }
        />
      </Section>

      <Section title="Refractivity" help={<Ic2Tag />}>
        <SwitchRow
          label="Enabled"
          name="Refractivity"
          help={
            <HelpTip topic="Refractivity">
              Bends what is behind the icon through the edge of the glass. Icon Composer 2 only, so
              turning it on makes the document require Xcode 27.
            </HelpTip>
          }
          checked={refractivity?.enabled === true}
          onChange={(on) =>
            setGlass(group.id, {
              refractivity: on ? { enabled: true, strength: 0.5, depth: 0.5 } : undefined,
            })
          }
        />
        {refractivity ? (
          <>
            <Slider
              label="Strength"
              value={refractivity.strength}
              onChange={(strength) => liveGlass({ refractivity: { ...refractivity, strength } })}
            />
            <Slider
              label="Depth"
              value={refractivity.depth}
              onChange={(depth) => liveGlass({ refractivity: { ...refractivity, depth } })}
            />
          </>
        ) : null}
      </Section>

      <Section title="Translucency">
        <SwitchRow
          label="Enabled"
          name="Translucency"
          checked={glass.translucency.enabled}
          onChange={(enabled) =>
            setGlass(group.id, { translucency: { ...glass.translucency, enabled } })
          }
        />
        <Slider
          label="Amount"
          value={glass.translucency.value}
          disabled={!glass.translucency.enabled}
          onChange={(value) => liveGlass({ translucency: { ...glass.translucency, value } })}
        />
      </Section>

      <Section title="Shadow">
        <Field label="Kind">
          <Select
            label="Shadow kind"
            value={glass.shadow.kind}
            options={SHADOW_OPTIONS}
            onChange={(kind) => setGlass(group.id, { shadow: { ...glass.shadow, kind } })}
          />
        </Field>
        <Slider
          label="Opacity"
          value={glass.shadow.opacity}
          disabled={glass.shadow.kind === 'none'}
          onChange={(opacity) => liveGlass({ shadow: { ...glass.shadow, opacity } })}
        />
      </Section>

      <Section title="Group">
        <Slider
          label="Opacity"
          value={group.opacity}
          onChange={(opacity) => liveGroup({ opacity })}
        />
        <Field label="Blend">
          <Select
            label="Group blend mode"
            value={group.blendMode}
            options={BLEND_MODE_OPTIONS}
            onChange={(blendMode: BlendMode) => updateGroup(group.id, { blendMode })}
          />
        </Field>
        <SwitchRow
          label="Hidden"
          name="Group hidden"
          checked={group.hidden}
          onChange={(hidden) => updateGroup(group.id, { hidden })}
        />
      </Section>
    </>
  )
}
