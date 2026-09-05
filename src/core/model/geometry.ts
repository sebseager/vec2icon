import type { BBox, Layer, ViewBox } from './types'
import { CANVAS_SIZE } from './types'

/** A 2D affine transform, matching the SVG `matrix(a b c d e f)` layout:
 * x' = a*x + c*y + e
 * y' = b*x + d*y + f
 */
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number }

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

/** m1 · m2 (apply m2 first, then m1). */
export const multiply = (m1: Matrix, m2: Matrix): Matrix => ({
  a: m1.a * m2.a + m1.c * m2.b,
  b: m1.b * m2.a + m1.d * m2.b,
  c: m1.a * m2.c + m1.c * m2.d,
  d: m1.b * m2.c + m1.d * m2.d,
  e: m1.a * m2.e + m1.c * m2.f + m1.e,
  f: m1.b * m2.e + m1.d * m2.f + m1.f,
})

/** Compose matrices left to right: compose(A, B, C) applies C first, then B, then A. */
const compose = (...ms: Matrix[]): Matrix => ms.reduceRight((acc, m) => multiply(m, acc))

export const translate = (tx: number, ty: number): Matrix => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: tx,
  f: ty,
})

export const scale = (sx: number, sy: number): Matrix => ({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 })

/** Rotation by `deg` degrees, clockwise (in the SVG y-down coordinate system). */
export const rotate = (deg: number): Matrix => {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

export const invert = (m: Matrix): Matrix => {
  const det = m.a * m.d - m.b * m.c
  return {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    e: (m.c * m.f - m.d * m.e) / det,
    f: (m.b * m.e - m.a * m.f) / det,
  }
}

export const applyToPoint = (m: Matrix, p: { x: number; y: number }): { x: number; y: number } => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
})

/** Format a number with up to 6 decimal places and no trailing zeros (never "-0"). */
const formatNumber = (n: number): string => {
  const rounded = Math.round(n * 1e6) / 1e6
  return (rounded === 0 ? 0 : rounded).toString()
}

/** "matrix(a b c d e f)" with up to 6 decimals, no trailing zeros. */
export const matrixToSvg = (m: Matrix): string =>
  `matrix(${formatNumber(m.a)} ${formatNumber(m.b)} ${formatNumber(m.c)} ${formatNumber(m.d)} ${formatNumber(m.e)} ${formatNumber(m.f)})`

/** AABB of the 4 transformed corners of `b`. */
export const transformBBox = (m: Matrix, b: BBox): BBox => {
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x, y: b.y + b.height },
    { x: b.x + b.width, y: b.y + b.height },
  ].map((p) => applyToPoint(m, p))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/** Fit a source viewBox into the 1024 canvas preserving aspect ratio, centered. */
export const fitViewBox = (vb: ViewBox): Matrix => {
  const [minX, minY, w, h] = vb
  const s = CANVAS_SIZE / Math.max(w, h)
  const cx = minX + w / 2
  const cy = minY + h / 2
  const half = CANVAS_SIZE / 2
  return { a: s, b: 0, c: 0, d: s, e: half - s * cx, f: half - s * cy }
}

/** Fitted bbox center of a layer in canvas coordinates — the pivot for scale/rotate. */
export const layerPivot = (
  layer: Pick<Layer, 'sourceViewBox' | 'bbox'>,
): { x: number; y: number } => {
  const fit = fitViewBox(layer.sourceViewBox)
  const center = {
    x: layer.bbox.x + layer.bbox.width / 2,
    y: layer.bbox.y + layer.bbox.height / 2,
  }
  return applyToPoint(fit, center)
}

/** Full source-units -> canvas matrix for a layer:
 *  T(pivot) · T(x, y) · R(rotation) · S(scaleX, scaleY) · T(-pivot) · fitViewBox(sourceViewBox)
 *  So identity Transform == pure fit; x/y translate; scale & rotate happen about the fitted bbox center. */
export const layerMatrix = (layer: Pick<Layer, 'sourceViewBox' | 'bbox' | 'transform'>): Matrix => {
  const pivot = layerPivot(layer)
  const { x, y, scaleX, scaleY, rotation } = layer.transform
  return compose(
    translate(pivot.x, pivot.y),
    translate(x, y),
    rotate(rotation),
    scale(scaleX, scaleY),
    translate(-pivot.x, -pivot.y),
    fitViewBox(layer.sourceViewBox),
  )
}

/** Layer bbox in canvas coordinates after layerMatrix. */
export const layerCanvasBBox = (layer: Pick<Layer, 'sourceViewBox' | 'bbox' | 'transform'>): BBox =>
  transformBBox(layerMatrix(layer), layer.bbox)
