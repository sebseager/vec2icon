/** Shown when layers are selected. Several at once share only the values that mean
 * the same thing on every one of them. */
import { FlipHorizontal, FlipVertical, Link, Unlink } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { updateLayer as updateLayerOp, updateLayers as updateLayersOp } from '@/core/model/ops'
import type { Appearance, BlendMode, Color, Layer } from '@/core/model/types'
import { colorKey, layerColors, recolorLayer } from '@/core/svg'
import { useEditor } from '@/state'
import { ColorField } from '../lib/ColorField'
import { Field, Section, SwitchRow } from '../lib/Field'
import { HelpTip } from '../lib/HelpTip'
import { IconButton } from '../lib/IconButton'
import { NumberField } from '../lib/NumberField'
import { BLEND_MODE_OPTIONS } from '../lib/options'
import { Select } from '../lib/Select'
import { Slider } from '../lib/Slider'
import { TextField } from '../lib/TextField'
import { LayerOverrides } from './LayerOverrides'

const round2 = (n: number): number => Math.round(n * 100) / 100

/** One swatch. The picker fires faster than the document re-renders, so the key of the
 * color to replace is tracked here rather than read back from the layer each time. */
const LayerSwatch = ({
  layerId,
  colorKey: key,
  color,
  index,
}: {
  layerId: string
  colorKey: string
  color: Color
  index: number
}) => {
  const commitCoalesced = useEditor((s) => s.commitCoalesced)
  const current = useRef(key)
  const lastProp = useRef(key)
  if (lastProp.current !== key) {
    lastProp.current = key
    current.current = key
  }

  return (
    <ColorField
      compact
      label={`Color ${index + 1}`}
      color={color}
      onChange={(next) => {
        const from = current.current
        current.current = colorKey(next)
        commitCoalesced((doc) =>
          updateLayerOp(doc, layerId, (layer) => recolorLayer(layer, from, next)),
        )
      }}
    />
  )
}

/** Every color the artwork paints with. Editing one rewrites it wherever it appears. */
const LayerColors = ({ layer }: { layer: Layer }) => {
  const colors = useMemo(() => layerColors(layer), [layer])
  if (colors.length === 0) return null
  return (
    <div className="flex min-h-7 items-start gap-2 py-0.5">
      <span className="w-[4.5rem] shrink-0 truncate pt-1 text-muted-foreground">Colors</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {colors.map((entry, index) => (
          <LayerSwatch
            // keyed by position so a swatch survives its own recolor with the picker open
            // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity here
            key={index}
            layerId={layer.id}
            colorKey={entry.key}
            color={entry.color}
            index={index}
          />
        ))}
      </div>
    </div>
  )
}

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
        <Button
          variant="outline"
          size="xs"
          aria-label="Flip horizontally"
          onClick={() => setTransform(layer.id, { scaleX: -t.scaleX })}
        >
          <FlipHorizontal size={13} aria-hidden="true" data-icon="inline-start" />H
        </Button>
        <Button
          variant="outline"
          size="xs"
          aria-label="Flip vertically"
          onClick={() => setTransform(layer.id, { scaleY: -t.scaleY })}
        >
          <FlipVertical size={13} aria-hidden="true" data-icon="inline-start" />V
        </Button>
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
            <LayerColors layer={first} />
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

        <SwitchRow
          label="Glass"
          help={
            <HelpTip topic="Glass">
              Off leaves the layer flat: no material, no highlight, no shadow. Use it for artwork
              that should read as printed on the icon rather than made of glass.
            </HelpTip>
          }
          checked={first.glass}
          onChange={(glass) => updateLayers(ids, { glass })}
        />

        <SwitchRow
          label="Hidden"
          checked={first.hidden}
          onChange={(hidden) => updateLayers(ids, { hidden })}
        />
      </Section>

      {single && appearance !== 'default' ? (
        <LayerOverrides layer={first} appearance={appearance} />
      ) : null}
    </>
  )
}
