/** Shown when layers are selected. Several at once share only the values that mean
 * the same thing on every one of them. */
import { FlipHorizontal, FlipVertical, Link, Unlink } from 'lucide-react'
import { useState } from 'react'
import { updateLayers as updateLayersOp } from '@/core/model/ops'
import type { Appearance, BlendMode, Layer } from '@/core/model/types'
import { useEditor } from '@/state'
import { Field, Section } from '../lib/Field'
import { HelpTip } from '../lib/HelpTip'
import { IconButton } from '../lib/IconButton'
import { NumberField } from '../lib/NumberField'
import { BLEND_MODE_OPTIONS } from '../lib/options'
import { Select } from '../lib/Select'
import { Slider } from '../lib/Slider'
import { TextField } from '../lib/TextField'
import { Toggle } from '../lib/Toggle'
import { LayerOverrides } from './LayerOverrides'

const round2 = (n: number): number => Math.round(n * 100) / 100

const Placement = ({ layer }: { layer: Layer }) => {
  const setTransform = useEditor((s) => s.setTransform)
  const [uniform, setUniform] = useState(true)
  const t = layer.transform

  const setScale = (axis: 'scaleX' | 'scaleY', percentValue: number): void => {
    const value = percentValue / 100
    setTransform(
      layer.id,
      uniform
        ? { scaleX: Math.sign(t.scaleX || 1) * value, scaleY: Math.sign(t.scaleY || 1) * value }
        : { [axis]: value },
    )
  }

  return (
    <>
      <Field label="Position">
        <NumberField
          label="Position X"
          value={round2(t.x)}
          onCommit={(x) => setTransform(layer.id, { x })}
        />
        <NumberField
          label="Position Y"
          value={round2(t.y)}
          onCommit={(y) => setTransform(layer.id, { y })}
        />
        <HelpTip topic="Position">
          Offset from the centre of the 1024 pt canvas, in points. Arrow keys nudge by 1, Shift by
          10.
        </HelpTip>
      </Field>

      <Field label="Scale">
        <NumberField
          label="Scale X"
          value={round2(Math.abs(t.scaleX) * 100)}
          suffix="%"
          onCommit={(value) => setScale('scaleX', value)}
        />
        <NumberField
          label="Scale Y"
          value={round2(Math.abs(t.scaleY) * 100)}
          suffix="%"
          onCommit={(value) => setScale('scaleY', value)}
        />
        <IconButton
          label={uniform ? 'Unlock scale axes' : 'Lock scale axes'}
          active={uniform}
          className="size-6"
          onClick={() => setUniform(!uniform)}
        >
          {uniform ? (
            <Link size={13} aria-hidden="true" />
          ) : (
            <Unlink size={13} aria-hidden="true" />
          )}
        </IconButton>
      </Field>

      <Field label="Rotation">
        <NumberField
          label="Rotation"
          value={round2(t.rotation)}
          suffix="°"
          onCommit={(rotation) => setTransform(layer.id, { rotation })}
        />
      </Field>

      <Field label="Flip">
        <button
          type="button"
          aria-label="Flip horizontally"
          className="flex h-6 items-center gap-1 rounded-[3px] border border-zinc-300 px-2 text-zinc-700 hover:bg-zinc-100"
          onClick={() => setTransform(layer.id, { scaleX: -t.scaleX })}
        >
          <FlipHorizontal size={13} aria-hidden="true" />H
        </button>
        <button
          type="button"
          aria-label="Flip vertically"
          className="flex h-6 items-center gap-1 rounded-[3px] border border-zinc-300 px-2 text-zinc-700 hover:bg-zinc-100"
          onClick={() => setTransform(layer.id, { scaleY: -t.scaleY })}
        >
          <FlipVertical size={13} aria-hidden="true" />V
        </button>
      </Field>
    </>
  )
}

export const LayerInspector = ({
  layers,
  appearance,
}: {
  layers: Layer[]
  appearance: Appearance
}) => {
  const first = layers[0]
  const ids = layers.map((l) => l.id)
  const updateLayer = useEditor((s) => s.updateLayer)
  const updateLayers = useEditor((s) => s.updateLayers)
  const commitCoalesced = useEditor((s) => s.commitCoalesced)
  if (!first) return null

  const single = layers.length === 1

  return (
    <>
      <Section title={single ? 'Layer' : `${layers.length} layers`}>
        {single ? (
          <>
            <Field label="Name">
              <TextField
                label="Name"
                value={first.name}
                onCommit={(name) => updateLayer(first.id, { name })}
              />
            </Field>
            <Placement layer={first} />
          </>
        ) : null}

        <Slider
          label="Opacity"
          value={first.opacity}
          onChange={(opacity) => commitCoalesced((doc) => updateLayersOp(doc, ids, { opacity }))}
        />

        <Field label="Blend">
          <Select
            label="Blend mode"
            value={first.blendMode}
            options={BLEND_MODE_OPTIONS}
            onChange={(blendMode: BlendMode) => updateLayers(ids, { blendMode })}
          />
          <HelpTip topic="Blend mode">
            Only the ten modes Icon Composer understands are listed. Anything else would be dropped
            when the bundle is written.
          </HelpTip>
        </Field>

        <Field label="Glass">
          <Toggle
            label="Glass"
            checked={first.glass}
            onChange={(glass) => updateLayers(ids, { glass })}
          />
          <HelpTip topic="Glass">
            Off leaves the layer flat: no material, no highlight, no shadow. Use it for artwork that
            should read as printed on the icon rather than made of glass.
          </HelpTip>
        </Field>

        <Field label="Hidden">
          <Toggle
            label="Hidden"
            checked={first.hidden}
            onChange={(hidden) => updateLayers(ids, { hidden })}
          />
        </Field>
      </Section>

      {single && appearance !== 'default' ? (
        <LayerOverrides layer={first} appearance={appearance} />
      ) : null}
    </>
  )
}
