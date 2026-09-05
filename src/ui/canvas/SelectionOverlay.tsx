/** Selection chrome drawn in canvas points on top of the rendered icon. */

import type { BBox } from '@/core/model/types'
import { CANVAS_SIZE } from '@/core/model/types'
import { CORNER_HANDLES, HANDLE_SIZE_PX, handlePositions } from './lib/handles'
import { ACCENT } from './lib/theme'

type Props = {
  selected: Array<{ id: string; bbox: BBox }>
  hover: BBox | null
  /** Canvas points per screen pixel, so the chrome keeps its size at any zoom. */
  ptsPerPixel: number
}

export const SelectionOverlay = ({ selected, hover, ptsPerPixel }: Props) => {
  const handleSide = HANDLE_SIZE_PX * ptsPerPixel

  return (
    // `inset-0` over the stage plus the 1024 viewBox is exactly the renderer's own
    // mapping, and the overflow clip keeps the chrome of a layer that hangs off the
    // canvas inside the stage instead of drawing it across the pane's gutter.
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
    >
      {hover && (
        <rect
          x={hover.x}
          y={hover.y}
          width={hover.width}
          height={hover.height}
          fill="none"
          stroke={ACCENT}
          strokeOpacity={0.35}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {selected.map(({ id, bbox }) => {
        const points = handlePositions(bbox, ptsPerPixel)
        return (
          <g key={id}>
            <rect
              x={bbox.x}
              y={bbox.y}
              width={bbox.width}
              height={bbox.height}
              fill="none"
              stroke={ACCENT}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {CORNER_HANDLES.map((corner) => (
              <rect
                key={corner}
                x={points[corner].x - handleSide / 2}
                y={points[corner].y - handleSide / 2}
                width={handleSide}
                height={handleSide}
                fill="var(--background)"
                stroke={ACCENT}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <circle
              cx={points.rotate.x}
              cy={points.rotate.y}
              r={handleSide / 2}
              fill="var(--background)"
              stroke={ACCENT}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )
      })}
    </svg>
  )
}
