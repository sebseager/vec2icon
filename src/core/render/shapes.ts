/** Platform mask shapes: the iOS/macOS squircle and the watchOS circle.
 *
 * Everything here is pure: paths for Canvas 2D / SVG, a signed-distance
 * texture for the WebGL final mask, and the safe area for the UI overlay.
 */
import type { BBox, Platform } from '../model/types'
import { CANVAS_SIZE } from '../model/types'

/** Corner extent as a fraction of the side, matching Apple's iOS squircle. */
export const IOS_CORNER_FRACTION = 0.2237
/** Superellipse exponent: |x/r|^n + |y/r|^n = 1. */
export const SUPERELLIPSE_N = 5
/** The macOS plate is the same shape at 824 points inside the 1024 canvas. */
export const MACOS_SCALE = 824 / 1024

const CIRCLE_POLYGON_SEGMENTS = 128
const SDF_CORNER_SEGMENTS = 24

const fmt = (n: number): string => {
  const rounded = Math.round(n * 1e4) / 1e4
  return (rounded === 0 ? 0 : rounded).toString()
}

/** One quarter of the superellipse, from (u=0, v=r) to (u=r, v=0), both positive. */
const cornerOffsets = (r: number, n: number, segments: number): Array<[number, number]> => {
  const exponent = 2 / n
  const points: Array<[number, number]> = []
  for (let i = 0; i <= segments; i++) {
    // theta runs pi/2 -> 0 so u grows from 0 to r
    const theta = (Math.PI / 2) * (1 - i / segments)
    points.push([r * Math.cos(theta) ** exponent, r * Math.sin(theta) ** exponent])
  }
  return points
}

const squircleVertices = (
  size: number,
  cornerFraction: number,
  n: number,
  segmentsPerCorner: number,
  ox: number,
  oy: number,
): Array<[number, number]> => {
  const r = size * cornerFraction
  const quarter = cornerOffsets(r, n, segmentsPerCorner)
  const reversed = [...quarter].reverse()
  const out: Array<[number, number]> = []
  const push = (x: number, y: number) => out.push([ox + x, oy + y])

  push(r, 0)
  push(size - r, 0)
  // top-right: (size - r, 0) -> (size, r)
  for (const [u, v] of quarter.slice(1)) push(size - r + u, r - v)
  push(size, size - r)
  // bottom-right: (size, size - r) -> (size - r, size)
  for (const [u, v] of reversed.slice(1)) push(size - r + u, size - r + v)
  push(r, size)
  // bottom-left: (r, size) -> (0, size - r)
  for (const [u, v] of quarter.slice(1)) push(r - u, size - r + v)
  push(0, r)
  // top-left: (0, r) -> (r, 0)
  for (const [u, v] of reversed.slice(1)) push(r - u, r - v)
  return out
}

const toPathData = (vertices: Array<[number, number]>): string => {
  const parts: string[] = []
  vertices.forEach(([x, y], i) => {
    parts.push(`${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)}`)
  })
  parts.push('Z')
  return parts.join('')
}

/** Closed SVG path data for a superellipse-cornered square of `size` at the origin. */
export const squirclePath = (
  size: number,
  cornerFraction = IOS_CORNER_FRACTION,
  n = SUPERELLIPSE_N,
  segmentsPerCorner = 16,
): string => toPathData(squircleVertices(size, cornerFraction, n, segmentsPerCorner, 0, 0))

/** Closed SVG path data for a circle inscribed in a `size` box. */
const circlePath = (size: number): string => {
  const r = size / 2
  return `M0 ${fmt(r)}A${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(size)} ${fmt(r)}A${fmt(r)} ${fmt(r)} 0 1 0 0 ${fmt(r)}Z`
}

/** Fraction of the side the platform plate is inset from the canvas on each edge. */
export const platformMaskInset = (platform: Platform): number =>
  platform === 'macos' ? (1 - MACOS_SCALE) / 2 : 0

/** Mask outline for a platform, in a `size` x `size` box. */
export const platformMaskPath = (platform: Platform, size: number): string => {
  if (platform === 'watchos') return circlePath(size)
  if (platform === 'macos') {
    const plate = size * MACOS_SCALE
    const offset = size * platformMaskInset('macos')
    return toPathData(
      squircleVertices(plate, IOS_CORNER_FRACTION, SUPERELLIPSE_N, 16, offset, offset),
    )
  }
  return squirclePath(size)
}

/** Flattened outline of the platform mask in a `size` box, as [x, y] pairs. */
const platformPolygon = (platform: Platform, size: number): Array<[number, number]> => {
  if (platform === 'watchos') {
    const r = size / 2
    const points: Array<[number, number]> = []
    for (let i = 0; i < CIRCLE_POLYGON_SEGMENTS; i++) {
      const a = (2 * Math.PI * i) / CIRCLE_POLYGON_SEGMENTS
      points.push([r + r * Math.cos(a), r + r * Math.sin(a)])
    }
    return points
  }
  const plate = platform === 'macos' ? size * MACOS_SCALE : size
  const offset = size * platformMaskInset(platform)
  return squircleVertices(
    plate,
    IOS_CORNER_FRACTION,
    SUPERELLIPSE_N,
    SDF_CORNER_SEGMENTS,
    offset,
    offset,
  )
}

const distanceToSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Signed distance in texture pixels, negative inside, one sample per pixel centre. */
export const sdfTexture = (platform: Platform, size: number): Float32Array => {
  const polygon = platformPolygon(platform, size)
  const count = polygon.length
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const py = y + 0.5
    for (let x = 0; x < size; x++) {
      const px = x + 0.5
      let distance = Number.POSITIVE_INFINITY
      let inside = false
      for (let i = 0, j = count - 1; i < count; j = i++) {
        const a = polygon[i] as [number, number]
        const b = polygon[j] as [number, number]
        distance = Math.min(distance, distanceToSegment(px, py, a[0], a[1], b[0], b[1]))
        if (a[1] > py !== b[1] > py && px < ((b[0] - a[0]) * (py - a[1])) / (b[1] - a[1]) + a[0]) {
          inside = !inside
        }
      }
      out[y * size + x] = inside ? -distance : distance
    }
  }
  return out
}

/** Region of the canvas (in points) art should stay inside for a platform. */
export const safeArea = (platform: Platform): BBox => {
  if (platform === 'watchos') {
    const side = (CANVAS_SIZE / Math.SQRT2) * 0.9
    const origin = (CANVAS_SIZE - side) / 2
    return { x: origin, y: origin, width: side, height: side }
  }
  const plate = platform === 'macos' ? CANVAS_SIZE * MACOS_SCALE : CANVAS_SIZE
  const plateOrigin = (CANVAS_SIZE - plate) / 2
  const inset = plate * 0.1
  return {
    x: plateOrigin + inset,
    y: plateOrigin + inset,
    width: plate - inset * 2,
    height: plate - inset * 2,
  }
}
