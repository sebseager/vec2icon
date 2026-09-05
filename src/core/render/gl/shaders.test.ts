import { describe, expect, it } from 'vitest'
import { BLEND_MODES } from '../../model/types'
import * as shaders from './shaders'
import {
  BLEND_MODE_INDEX,
  FRAG_BACKGROUND,
  FRAG_BLEND,
  FRAG_BLUR,
  FRAG_COPY,
  FRAG_GLASS,
  FRAG_MASK,
  FRAG_NORMALS,
  FRAG_PLATE,
  flipSourceUv,
  VERTEX_FULLSCREEN,
} from './shaders'

/** Every exported shader source, paired with its export name. */
const sources = (): Array<[string, string]> => {
  const out: Array<[string, string]> = []
  for (const [name, value] of Object.entries(shaders)) {
    if (typeof value === 'string') out.push([name, value])
  }
  return out
}

const uniformsOf = (src: string): string[] =>
  [...src.matchAll(/uniform\s+\w+\s+(\w+);/g)].map((m) => m[1] as string)

describe('shader sources', () => {
  it('exports at least the nine programs the pipeline needs', () => {
    expect(sources().length).toBeGreaterThanOrEqual(9)
  })

  it('all start with the GLSL ES 3.00 directive on the very first line', () => {
    for (const [name, src] of sources()) {
      expect(`${name}:${src.split('\n')[0]}`).toBe(`${name}:#version 300 es`)
    }
  })

  it('all define main and have balanced braces and parentheses', () => {
    for (const [name, src] of sources()) {
      const count = (ch: string) => (src.match(new RegExp(`\\${ch}`, 'g')) ?? []).length
      expect(`${name} main`).toBe(/void main\(\)/.test(src) ? `${name} main` : `${name} NO main`)
      expect(`${name} braces ${count('{') - count('}')}`).toBe(`${name} braces 0`)
      expect(`${name} parens ${count('(') - count(')')}`).toBe(`${name} parens 0`)
    }
  })

  it('declare no duplicate and no unused uniforms', () => {
    for (const [name, src] of sources()) {
      const uniforms = uniformsOf(src)
      const duplicates = uniforms.filter((u, i) => uniforms.indexOf(u) !== i)
      expect(`${name}:${duplicates.join(',')}`).toBe(`${name}:`)
      const unused = uniforms.filter(
        (u) => (src.match(new RegExp(`\\b${u}\\b`, 'g')) ?? []).length < 2,
      )
      expect(`${name}:${unused.join(',')}`).toBe(`${name}:`)
    }
  })
})

describe('source uv flip', () => {
  // layer rasters arrive from createImageBitmap y-down; render targets are v-up
  it('flips v only when asked', () => {
    expect(flipSourceUv(0.25, 0.75, false)).toEqual([0.25, 0.75])
    expect(flipSourceUv(0.25, 0.75, true)).toEqual([0.25, 0.25])
    expect(flipSourceUv(0.1, 0, true)).toEqual([0.1, 1])
    expect(flipSourceUv(0.1, 1, true)).toEqual([0.1, 0])
  })

  it('leaves the midpoint and the u axis alone', () => {
    expect(flipSourceUv(0.3, 0.5, true)).toEqual([0.3, 0.5])
  })

  it('is its own inverse', () => {
    const [u, v] = flipSourceUv(0.2, 0.9, true)
    expect(flipSourceUv(u, v, true)).toEqual([0.2, 0.9])
  })

  it('is applied by every shader that samples a layer raster', () => {
    for (const src of [FRAG_COPY, FRAG_BLEND, FRAG_BLUR]) {
      expect(src).toContain('uniform float uFlipSource;')
      expect(src).toContain(
        'vec2 sourceUv() { return vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipSource)); }',
      )
      expect(src).toContain('sourceUv()')
    }
  })

  it('is absent from shaders that only ever read render targets', () => {
    for (const src of [FRAG_BACKGROUND, FRAG_NORMALS, FRAG_GLASS, FRAG_PLATE, FRAG_MASK]) {
      expect(src).not.toContain('uFlipSource')
    }
  })

  it('never flips the blend destination, which is always a render target', () => {
    expect(FRAG_BLEND).toContain('texture(uDest, vUv)')
    expect(FRAG_BLEND).toContain('texture(uSource, sourceUv())')
  })
})

describe('FRAG_COPY', () => {
  it('scales all four premultiplied channels by uAlpha', () => {
    expect(FRAG_COPY).toContain('uniform float uAlpha;')
    expect(FRAG_COPY).toContain('texture(uSource, sourceUv()) * uAlpha')
  })
})

describe('FRAG_MASK', () => {
  it('mixes the wallpaper in and stays opaque for the interactive preview', () => {
    expect(FRAG_MASK).toContain('mix(backdrop.rgb, scene.rgb, coverage)')
  })

  it('drops the backdrop and makes alpha the mask coverage for the PNG export', () => {
    expect(FRAG_MASK).toContain('uniform float uTransparent;')
    expect(FRAG_MASK).toContain('if (uTransparent > 0.5)')
    expect(FRAG_MASK).toContain('outColor = scene * coverage;')
  })
})

describe('BLEND_MODE_INDEX', () => {
  it('covers every blend mode exactly once with a contiguous index', () => {
    const indices = BLEND_MODES.map((mode) => BLEND_MODE_INDEX[mode])
    expect(indices).toHaveLength(18)
    expect(new Set(indices).size).toBe(18)
    expect([...indices].sort((a, b) => a - b)).toEqual(Array.from({ length: 18 }, (_, i) => i))
  })

  it('maps normal to 0, the fall-through case of blendChannel', () => {
    expect(BLEND_MODE_INDEX.normal).toBe(0)
  })

  it('has a branch in the shader for every non-normal separable mode', () => {
    for (let mode = 1; mode <= 15; mode++) {
      expect(FRAG_BLEND).toContain(`mode == ${mode}`)
    }
    // the two additive modes are handled in compositeBlend, not blendChannel
    expect(FRAG_BLEND).toContain('mode == 16')
    expect(FRAG_BLEND).toContain('mode == 17')
  })
})

describe('VERTEX_FULLSCREEN', () => {
  it('is attributeless and covers the viewport with one triangle', () => {
    expect(VERTEX_FULLSCREEN).toContain('gl_VertexID')
    expect(VERTEX_FULLSCREEN).not.toContain('in vec')
    expect(VERTEX_FULLSCREEN).toContain('out vec2 vUv;')
  })
})
