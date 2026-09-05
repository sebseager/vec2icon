import { describe, expect, it } from 'vitest'
import { emptyDoc } from '../model/defaults'
import { createFlatRenderer } from './flat'
import { createGlRenderer } from './gl/renderer'
import { createRenderer } from './index'
import type { RenderOptions } from './types'

const options: RenderOptions = {
  rendition: 'default',
  platform: 'ios',
  wallpaper: 'light',
  lightAngle: 0,
  tint: { space: 'srgb', components: [0.2, 0.6, 1, 1] },
  pixelRatio: 1,
}

const canvas = (): HTMLCanvasElement => document.createElement('canvas')

describe('createRenderer', () => {
  it('falls back to the flat renderer when WebGL2 is unavailable', () => {
    expect(createRenderer(canvas()).kind).toBe('flat')
  })

  it('returns null from createGlRenderer without WebGL2', () => {
    expect(createGlRenderer(canvas())).toBeNull()
  })

  it('does not throw when a canvas has no getContext at all', () => {
    const bare = { width: 0, height: 0 } as unknown as HTMLCanvasElement
    expect(createGlRenderer(bare)).toBeNull()
  })

  it('exposes the whole Renderer surface', () => {
    const renderer = createRenderer(canvas())
    expect(typeof renderer.render).toBe('function')
    expect(typeof renderer.toBlob).toBe('function')
    expect(typeof renderer.resize).toBe('function')
    expect(typeof renderer.dispose).toBe('function')
    renderer.dispose()
  })
})

describe('createFlatRenderer', () => {
  it('renders and resizes an empty document without throwing', () => {
    const renderer = createFlatRenderer(canvas())
    expect(() => renderer.resize(320, 320)).not.toThrow()
    expect(() => renderer.render(emptyDoc(), options)).not.toThrow()
    expect(() => renderer.render(emptyDoc(), { ...options, wallpaper: 'checker' })).not.toThrow()
    renderer.dispose()
  })

  it('is idempotent on dispose', () => {
    const renderer = createFlatRenderer(canvas())
    renderer.dispose()
    expect(() => renderer.dispose()).not.toThrow()
  })

  it('ignores renders after dispose', () => {
    const renderer = createFlatRenderer(canvas())
    renderer.dispose()
    expect(() => renderer.render(emptyDoc(), options)).not.toThrow()
  })
})
