import { describe, expect, it } from 'vitest'
import {
  IOS_CORNER_FRACTION,
  MACOS_SCALE,
  platformMaskInset,
  platformMaskPath,
  SUPERELLIPSE_N,
  safeArea,
  sdfTexture,
  squirclePath,
} from './shapes'

/** Every coordinate pair in a path made of M/L/A/Z commands. */
const pathPoints = (d: string): Array<[number, number]> => {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? []
  const points: Array<[number, number]> = []
  const commands = d.match(/[MLAZ][^MLAZ]*/g) ?? []
  let index = 0
  for (const command of commands) {
    const count = (command.match(/-?\d+(?:\.\d+)?/g) ?? []).length
    const head = command[0]
    if (head === 'M' || head === 'L') {
      for (let i = 0; i < count; i += 2) {
        const x = Number(numbers[index + i])
        const y = Number(numbers[index + i + 1])
        points.push([x, y])
      }
    } else if (head === 'A') {
      // rx ry rotation large-arc sweep x y — only the last pair is a point
      for (let i = 0; i + 7 <= count; i += 7) {
        points.push([Number(numbers[index + i + 5]), Number(numbers[index + i + 6])])
      }
    }
    index += count
  }
  return points
}

describe('constants', () => {
  it('match the spec values', () => {
    expect(IOS_CORNER_FRACTION).toBeCloseTo(0.2237, 6)
    expect(SUPERELLIPSE_N).toBe(5)
    expect(MACOS_SCALE).toBeCloseTo(824 / 1024, 12)
  })
})

describe('squirclePath', () => {
  const d = squirclePath(1024)

  it('starts with a move and is explicitly closed', () => {
    expect(d.startsWith('M')).toBe(true)
    expect(d.trimEnd().endsWith('Z')).toBe(true)
  })

  it('stays inside the box', () => {
    for (const [x, y] of pathPoints(d)) {
      expect(x).toBeGreaterThanOrEqual(-1e-6)
      expect(x).toBeLessThanOrEqual(1024 + 1e-6)
      expect(y).toBeGreaterThanOrEqual(-1e-6)
      expect(y).toBeLessThanOrEqual(1024 + 1e-6)
    }
  })

  it('reaches all four sides of the box', () => {
    const points = pathPoints(d)
    const xs = points.map(([x]) => x)
    const ys = points.map(([, y]) => y)
    expect(Math.min(...xs)).toBe(0)
    expect(Math.max(...xs)).toBe(1024)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(1024)
  })

  it('is symmetric about both axes', () => {
    const points = pathPoints(d)
    const has = (px: number, py: number) =>
      points.some(([x, y]) => Math.abs(x - px) < 1e-3 && Math.abs(y - py) < 1e-3)
    for (const [x, y] of points) {
      expect(has(1024 - x, y)).toBe(true)
      expect(has(x, 1024 - y)).toBe(true)
    }
  })

  it('places the corner tangent points at the corner fraction of the side', () => {
    const points = pathPoints(d)
    const r = 1024 * IOS_CORNER_FRACTION
    expect(points.some(([x, y]) => Math.abs(x - r) < 1e-3 && y === 0)).toBe(true)
    expect(points.some(([x, y]) => Math.abs(x - (1024 - r)) < 1e-3 && y === 0)).toBe(true)
  })

  it('emits segmentsPerCorner segments in each corner', () => {
    const few = pathPoints(squirclePath(1024, IOS_CORNER_FRACTION, SUPERELLIPSE_N, 4))
    const many = pathPoints(squirclePath(1024, IOS_CORNER_FRACTION, SUPERELLIPSE_N, 32))
    expect(many.length).toBeGreaterThan(few.length)
    expect(many.length - few.length).toBe(4 * (32 - 4))
  })

  it('bulges past the circular arc (superellipse, not a rounded rect)', () => {
    const r = 1024 * IOS_CORNER_FRACTION
    const points = pathPoints(squirclePath(1024))
    // the point of the top-right corner nearest the 45 degree diagonal
    const cx = 1024 - r
    const cy = r
    let best = Number.POSITIVE_INFINITY
    let bestDist = 0
    for (const [x, y] of points) {
      if (x < cx || y > cy) continue
      const angle = Math.atan2(cy - y, x - cx)
      const delta = Math.abs(angle - Math.PI / 4)
      if (delta < best) {
        best = delta
        bestDist = Math.hypot(x - cx, y - cy)
      }
    }
    expect(bestDist).toBeGreaterThan(r)
    expect(bestDist).toBeLessThan(r * Math.SQRT2)
  })
})

describe('platformMaskPath', () => {
  it('is the plain squircle on iOS', () => {
    expect(platformMaskPath('ios', 1024)).toBe(squirclePath(1024))
  })

  it('insets and centres the squircle on macOS', () => {
    const d = platformMaskPath('macos', 1024)
    const inset = (1024 * (1 - MACOS_SCALE)) / 2
    const xs = pathPoints(d).map(([x]) => x)
    const ys = pathPoints(d).map(([, y]) => y)
    expect(Math.min(...xs)).toBeCloseTo(inset, 3)
    expect(Math.max(...xs)).toBeCloseTo(1024 - inset, 3)
    expect(Math.min(...ys)).toBeCloseTo(inset, 3)
    expect(Math.max(...ys)).toBeCloseTo(1024 - inset, 3)
  })

  it('is a circle on watchOS', () => {
    const d = platformMaskPath('watchos', 1024)
    expect(d).toContain('A')
    for (const [x, y] of pathPoints(d)) {
      expect(Math.hypot(x - 512, y - 512)).toBeCloseTo(512, 3)
    }
  })
})

describe('platformMaskInset', () => {
  it('is zero for ios and watchos and the macOS plate inset for macos', () => {
    expect(platformMaskInset('ios')).toBe(0)
    expect(platformMaskInset('watchos')).toBe(0)
    expect(platformMaskInset('macos')).toBeCloseTo((1 - MACOS_SCALE) / 2, 12)
  })
})

describe('sdfTexture', () => {
  const size = 64
  const at = (t: Float32Array, x: number, y: number) => t[y * size + x] as number

  it('has one sample per pixel', () => {
    expect(sdfTexture('ios', size).length).toBe(size * size)
  })

  it('is negative at the centre and positive at the corners for every platform', () => {
    for (const platform of ['ios', 'macos', 'watchos'] as const) {
      const t = sdfTexture(platform, size)
      expect(at(t, size / 2, size / 2)).toBeLessThan(0)
      expect(at(t, 0, 0)).toBeGreaterThan(0)
      expect(at(t, size - 1, size - 1)).toBeGreaterThan(0)
    }
  })

  it('keeps the shape edge away from the texture border when given a margin', () => {
    // Without a margin the last column sits half a texel inside the iOS mask, so a
    // renderer that clamps at the border can never see the edge itself. With one, the
    // border column is outside the shape and the edge lands inside the texture.
    const flush = sdfTexture('ios', size)
    expect(at(flush, size - 1, size / 2)).toBeLessThan(0)
    const margin = 1 / 8
    const padded = sdfTexture('ios', size, margin)
    expect(at(padded, size - 1, size / 2)).toBeGreaterThan(0)
    expect(at(padded, 0, size / 2)).toBeGreaterThan(0)
    // the texel whose centre maps onto the shape edge reads (close to) zero
    const edgeTexel = Math.round((size + margin * size) / (1 + 2 * margin) - 0.5)
    expect(Math.abs(at(padded, edgeTexel, size / 2))).toBeLessThan(1)
    // distances stay in shape units: the centre is as deep inside as before
    expect(at(padded, size / 2, size / 2)).toBeCloseTo(at(flush, size / 2, size / 2), 0)
  })

  it('is near zero at an edge midpoint of the iOS shape', () => {
    const t = sdfTexture('ios', size)
    expect(Math.abs(at(t, size / 2, 0))).toBeLessThan(1.5)
    expect(Math.abs(at(t, 0, size / 2))).toBeLessThan(1.5)
  })

  it('measures the macOS plate inset along the middle row', () => {
    const t = sdfTexture('macos', size)
    const inset = size * platformMaskInset('macos')
    // just outside the plate is positive, just inside is negative
    expect(at(t, Math.round(inset) - 2, size / 2)).toBeGreaterThan(0)
    expect(at(t, Math.round(inset) + 2, size / 2)).toBeLessThan(0)
  })

  it('approximates the circle radius on watchOS', () => {
    const t = sdfTexture('watchos', size)
    const r = size / 2
    for (const [x, y] of [
      [size / 2, 4],
      [4, size / 2],
      [size / 2, size - 4],
    ]) {
      const expected = Math.hypot((x as number) + 0.5 - r, (y as number) + 0.5 - r) - r
      expect(at(t, x as number, y as number)).toBeCloseTo(expected, 0)
    }
  })
})

describe('safeArea', () => {
  it('insets the iOS canvas by 10% on each side', () => {
    expect(safeArea('ios')).toEqual({ x: 102.4, y: 102.4, width: 819.2, height: 819.2 })
  })

  it('insets the macOS plate by 10% on each side', () => {
    const area = safeArea('macos')
    expect(area.x).toBeCloseTo(100 + 82.4, 6)
    expect(area.width).toBeCloseTo(824 * 0.8, 6)
    expect(area.x + area.width).toBeCloseTo(1024 - area.x, 6)
  })

  it('uses the inscribed square of the watchOS circle inset by 5%', () => {
    const area = safeArea('watchos')
    const inscribed = 1024 / Math.SQRT2
    expect(area.width).toBeCloseTo(inscribed * 0.9, 6)
    expect(area.height).toBeCloseTo(area.width, 6)
    expect(area.x + area.width / 2).toBeCloseTo(512, 6)
    expect(area.y + area.height / 2).toBeCloseTo(512, 6)
  })

  it('keeps every safe area strictly inside its platform mask', () => {
    for (const platform of ['ios', 'macos', 'watchos'] as const) {
      const size = 128
      const t = sdfTexture(platform, size)
      const area = safeArea(platform)
      const corners = [
        [area.x, area.y],
        [area.x + area.width, area.y],
        [area.x, area.y + area.height],
        [area.x + area.width, area.y + area.height],
      ]
      for (const [x, y] of corners) {
        const px = Math.min(size - 1, Math.max(0, Math.round(((x as number) / 1024) * size)))
        const py = Math.min(size - 1, Math.max(0, Math.round(((y as number) / 1024) * size)))
        expect(t[py * size + px] as number).toBeLessThan(0)
      }
    }
  })
})
