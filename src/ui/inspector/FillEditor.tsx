/** Edits one `Fill`: the document background in Default or Dark. */
import type { Color, Fill } from '@/core/model/types'
import { ColorField } from '../lib/ColorField'
import { Field } from '../lib/Field'
import { type Option, Select } from '../lib/Select'
import { Slider } from '../lib/Slider'

type Kind = Fill['kind']

const KIND_OPTIONS: readonly Option<Kind>[] = [
  { value: 'none', label: 'None' },
  { value: 'solid', label: 'Solid' },
  { value: 'automatic-gradient', label: 'Automatic gradient' },
  { value: 'linear-gradient', label: 'Linear gradient' },
]

const WHITE: Color = { space: 'srgb', components: [1, 1, 1, 1] }
const BLUE: Color = { space: 'srgb', components: [0.04, 0.52, 1, 1] }

const firstColor = (fill: Fill): Color =>
  fill.kind === 'solid' || fill.kind === 'automatic-gradient'
    ? fill.color
    : fill.kind === 'linear-gradient'
      ? fill.colors[0]
      : BLUE

const secondColor = (fill: Fill): Color =>
  fill.kind === 'linear-gradient' ? fill.colors[1] : WHITE

/** Keep whatever color the previous kind carried when switching kinds. */
const changeKind = (fill: Fill, kind: Kind): Fill => {
  if (kind === fill.kind) return fill
  const color = firstColor(fill)
  if (kind === 'none') return { kind: 'none' }
  if (kind === 'linear-gradient') {
    return { kind: 'linear-gradient', colors: [color, secondColor(fill)], angle: 0 }
  }
  return { kind, color }
}

const ColorRow = ({
  label,
  color,
  onChange,
}: {
  label: string
  color: Color
  onChange: (color: Color) => void
}) => (
  <Field label={label}>
    <ColorField label={`${label} color`} color={color} onChange={onChange} />
  </Field>
)

export const FillEditor = ({
  label,
  fill,
  onChange,
  onLiveChange,
}: {
  label: string
  fill: Fill
  onChange: (fill: Fill) => void
  onLiveChange?: (fill: Fill) => void
}) => {
  const live = onLiveChange ?? onChange
  return (
    <>
      <Field label="Kind">
        <Select
          label={`${label} kind`}
          value={fill.kind}
          options={KIND_OPTIONS}
          onChange={(kind) => onChange(changeKind(fill, kind))}
        />
      </Field>

      {fill.kind === 'solid' || fill.kind === 'automatic-gradient' ? (
        <ColorRow
          label={fill.kind === 'solid' ? 'Color' : 'Base'}
          color={fill.color}
          onChange={(color) => live({ ...fill, color })}
        />
      ) : null}

      {fill.kind === 'linear-gradient' ? (
        <>
          <ColorRow
            label="Start"
            color={fill.colors[0]}
            onChange={(color) => live({ ...fill, colors: [color, fill.colors[1]] })}
          />
          <ColorRow
            label="End"
            color={fill.colors[1]}
            onChange={(color) => live({ ...fill, colors: [fill.colors[0], color] })}
          />
          <Slider
            label="Angle"
            value={fill.angle}
            min={0}
            max={360}
            step={1}
            format={(n) => `${Math.round(n)}°`}
            onChange={(angle) => live({ ...fill, angle })}
          />
        </>
      ) : null}
    </>
  )
}
