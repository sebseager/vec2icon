/** A 24px dial for the preview light direction: drag the dot around the circle. */
import { useCallback, useRef } from 'react'
import { angleFromTop, normalizeAngle } from './lib/gestures'
import { capturePointer, releasePointer } from './lib/pointerCapture'
import { ACCENT } from './lib/theme'

const SIZE = 24
const DOT_RADIUS = 7.5
const KEY_STEP = 5

type Props = {
  angle: number
  onChange: (angle: number) => void
}

export const LightDial = ({ angle, onChange }: Props) => {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const angleAt = useCallback((clientX: number, clientY: number): number | null => {
    const el = ref.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return null
    return Math.round(
      angleFromTop(
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        { x: clientX, y: clientY },
      ),
    )
  }, [])

  const track = useCallback(
    (e: React.PointerEvent) => {
      const next = angleAt(e.clientX, e.clientY)
      if (next !== null) onChange(next)
    },
    [angleAt, onChange],
  )

  const radians = (normalizeAngle(angle) * Math.PI) / 180
  const dot = {
    left: SIZE / 2 + DOT_RADIUS * Math.sin(radians),
    top: SIZE / 2 - DOT_RADIUS * Math.cos(radians),
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Light angle"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(normalizeAngle(angle))}
      aria-valuetext={`${Math.round(normalizeAngle(angle))} degrees`}
      className="relative shrink-0 cursor-grab touch-none rounded-full border border-zinc-300 bg-white shadow-inner outline-none active:cursor-grabbing focus-visible:border-[#0a84ff] focus-visible:ring-2 focus-visible:ring-[#0a84ff]/30"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={(e) => {
        dragging.current = true
        capturePointer(e.currentTarget, e.pointerId)
        track(e)
      }}
      onPointerMove={(e) => {
        if (dragging.current) track(e)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        releasePointer(e.currentTarget, e.pointerId)
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
      onKeyDown={(e) => {
        const step =
          e.key === 'ArrowRight' || e.key === 'ArrowUp'
            ? KEY_STEP
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
              ? -KEY_STEP
              : 0
        if (step === 0) return
        e.preventDefault()
        onChange(normalizeAngle(angle + step))
      }}
    >
      <span
        aria-hidden="true"
        className="absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: dot.left, top: dot.top, backgroundColor: ACCENT }}
      />
    </div>
  )
}
