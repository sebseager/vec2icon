/** Option lists shared by the inspector. */
import type { BlendMode } from '@/core/model/types'
import type { Option } from './Select'

/** Only the ten blend modes `icon.json` accepts — the rest would be dropped on export. */
export const BLEND_MODE_OPTIONS: readonly Option<BlendMode>[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'darken', label: 'Darken' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'plus-darker', label: 'Plus darker' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'screen', label: 'Screen' },
  { value: 'plus-lighter', label: 'Plus lighter' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft light' },
  { value: 'hard-light', label: 'Hard light' },
]

export const percent = (n: number): string => `${Math.round(n * 100)}%`
