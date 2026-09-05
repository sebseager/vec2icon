/** WebGL2 renderer: an approximation of Apple's Liquid Glass compositor.
 *
 * Per frame the pipeline is
 *   1. wallpaper -> backdrop, copied into the scene
 *   2. document fill (or Clear/Tinted plate) over the scene
 *   3. for each group bottom to top: composite its layers into a group texture,
 *      blur the glass alpha, derive normals, then one glass pass applying
 *      shadow, translucency, refraction and the specular rim
 *   4. final pass: wallpaper everywhere, scene inside the platform SDF mask
 *
 * Everything that touches a browser API is guarded so importing this module and
 * calling `createGlRenderer` outside a browser returns null instead of throwing.
 */
import type { ResolvedLayer } from '../../model/appearance'
import { docFill, resolveLayer } from '../../model/appearance'
import type { Appearance, Color, Glass, Group, IconDoc, Layer, Platform } from '../../model/types'
import { CANVAS_SIZE } from '../../model/types'
import { automaticGradientStops, linearGradientVector, wallpaperStops } from '../gradient'
import { monoColor } from '../luminance'
import { rasterCacheKey, rasterizeLayer, rasterSizeFor, reserveRasterCache } from '../raster'
import type { Plate } from '../rendition'
import { renditionPlan } from '../rendition'
import { sdfTexture } from '../shapes'
import type { Renderer, RenderOptions } from '../types'
import type { RenderTarget } from './program'
import {
  bindTextures,
  createProgram,
  drawFullscreenTriangle,
  setUniforms,
  TargetPool,
} from './program'
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
  VERTEX_FULLSCREEN,
} from './shaders'

/** Blur radius in canvas points: 2 at blurMaterial 0, 32 at 1. */
const BLUR_BASE = 2
const BLUR_RANGE = 30
/** Shadow displacement in canvas points, before the light-angle rotation. */
const SHADOW_OFFSET = 6
/** How far the specular band moves for an explicit inside/outside placement. */
const SPECULAR_SHIFT = 2
/** Maximum refraction displacement in canvas points at strength = depth = 1. */
const REFRACTION_MAX = 24
/** Gradient amplification when turning blurred alpha into a normal field. */
const NORMAL_HEIGHT = 3
/** Elevation of the key light above the icon plane. */
const LIGHT_ELEVATION = 0.7
/** Signed-distance texture resolution and the range it encodes, in its own texels. */
const SDF_SIZE = 256
const SDF_SPREAD = 6
/** Rim drawn just inside the plate edge, in canvas points. */
const PLATE_RIM_WIDTH = 3
const MAX_LAYER_TEXTURES = 64

/** Upper bound on one frame's raster working set, reserved before every draw. */
const layerBudget = (doc: IconDoc): number =>
  doc.groups.reduce((total, group) => total + group.layers.length, 0)

type Rgba = [number, number, number, number]

const toRgba = (c: Color): Rgba => {
  if (c.space === 'gray') {
    const w = c.components[0] ?? 0
    return [w, w, w, c.components[1] ?? 1]
  }
  return [c.components[0] ?? 0, c.components[1] ?? 0, c.components[2] ?? 0, c.components[3] ?? 1]
}

/** Plate body and rim colors for the Clear and Tinted renditions. */
const PLATES: Record<Exclude<Plate, 'none'>, { body: Rgba; rim: Rgba }> = {
  'clear-light': { body: [1, 1, 1, 0.18], rim: [1, 1, 1, 0.4] },
  'clear-dark': { body: [0.04, 0.04, 0.05, 0.3], rim: [1, 1, 1, 0.28] },
  'tinted-light': { body: [0.92, 0.92, 0.94, 1], rim: [1, 1, 1, 0.5] },
  'tinted-dark': { body: [0.11, 0.11, 0.12, 1], rim: [1, 1, 1, 0.18] },
}

/** Gradient endpoints in v-up uv space; `linearGradientVector` is y-down. */
const gradientEndpoints = (angle: number): { p0: [number, number]; p1: [number, number] } => {
  const v = linearGradientVector(angle)
  return { p0: [v.x1, 1 - v.y1], p1: [v.x2, 1 - v.y2] }
}

/** Signed distance packed into R8: 0.5 is the outline, +/-SDF_SPREAD the range. */
const sdfBytes = (platform: Platform): Uint8Array => {
  const field = sdfTexture(platform, SDF_SIZE)
  const bytes = new Uint8Array(field.length)
  for (let i = 0; i < field.length; i++) {
    const normalized = (field[i] as number) / SDF_SPREAD / 2 + 0.5
    bytes[i] = Math.round(Math.min(1, Math.max(0, normalized)) * 255)
  }
  return bytes
}

const acquireContext = (canvas: HTMLCanvasElement): WebGL2RenderingContext | null => {
  if (!canvas || typeof canvas.getContext !== 'function') return null
  try {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    })
    if (!gl || typeof (gl as WebGL2RenderingContext).createProgram !== 'function') return null
    return gl as WebGL2RenderingContext
  } catch {
    return null
  }
}

/** A WebGL2 renderer, or null when WebGL2 is unavailable. */
export const createGlRenderer = (canvas: HTMLCanvasElement): Renderer | null => {
  const gl = acquireContext(canvas)
  if (!gl) return null

  const programs = {
    background: createProgram(gl, VERTEX_FULLSCREEN, FRAG_BACKGROUND),
    blur: createProgram(gl, VERTEX_FULLSCREEN, FRAG_BLUR),
    normals: createProgram(gl, VERTEX_FULLSCREEN, FRAG_NORMALS),
    blend: createProgram(gl, VERTEX_FULLSCREEN, FRAG_BLEND),
    glass: createProgram(gl, VERTEX_FULLSCREEN, FRAG_GLASS),
    plate: createProgram(gl, VERTEX_FULLSCREEN, FRAG_PLATE),
    mask: createProgram(gl, VERTEX_FULLSCREEN, FRAG_MASK),
    copy: createProgram(gl, VERTEX_FULLSCREEN, FRAG_COPY),
  }
  if (Object.values(programs).some((program) => program === null)) {
    for (const program of Object.values(programs)) if (program) gl.deleteProgram(program)
    return null
  }

  const vao = gl.createVertexArray()
  const pool = new TargetPool(gl)
  const sdfCache = new Map<Platform, WebGLTexture>()
  const layerTextures = new Map<string, WebGLTexture>()
  const pending = new Set<string>()

  let disposed = false
  let cssWidth = canvas.width || CANVAS_SIZE
  let cssHeight = canvas.height || CANVAS_SIZE
  let renderSize = CANVAS_SIZE
  let lastDoc: IconDoc | null = null
  let lastOptions: RenderOptions | null = null
  let frame: number | null = null
  /** Composited scene held across frames so an unchanged render is a blit. */
  let cached: { scene: RenderTarget; backdrop: RenderTarget } | null = null
  let cachedDoc: IconDoc | null = null
  let cachedKey: string | null = null
  /** Set when a raster lands or the targets are gone, forcing a full pipeline run. */
  let contentDirty = true

  /** Everything except the document that changes what the pipeline produces. */
  const pipelineKey = (options: RenderOptions, size: number): string =>
    [
      options.rendition,
      options.platform,
      options.wallpaper,
      options.lightAngle,
      options.pixelRatio,
      options.tint.space,
      options.tint.components.join(','),
      size,
    ].join('|')

  const invalidate = (): void => {
    // release before dropping the reference, or the targets leak out of the pool
    if (cached) pool.release(cached.scene, cached.backdrop)
    cached = null
    cachedDoc = null
    cachedKey = null
    contentDirty = true
  }

  // bound rather than called as `gl.useProgram(...)`: the lint rule for React
  // hooks treats any `useXxx()` call site as a hook
  const selectProgram: (program: WebGLProgram | null) => void = gl.useProgram.bind(gl)

  const activate = (program: WebGLProgram | null): WebGLProgram => {
    selectProgram(program)
    return program as WebGLProgram
  }

  const bindTarget = (target: RenderTarget | null, size: number): void => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null)
    gl.viewport(0, 0, size, size)
  }

  const blending = (on: boolean): void => {
    if (on) {
      gl.enable(gl.BLEND)
      gl.blendEquation(gl.FUNC_ADD)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    } else {
      gl.disable(gl.BLEND)
    }
  }

  const clearTarget = (target: RenderTarget): void => {
    bindTarget(target, renderSize)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  /** Layer rasters are y-down ImageBitmaps; render targets are v-up. */
  const LAYER_FLIP = 1
  const TARGET_FLIP = 0

  /**
   * Copy `source` into `target` at `alpha`. `flip` is LAYER_FLIP when the source
   * is a layer raster, TARGET_FLIP when it is another render target.
   */
  const drawCopy = (
    target: RenderTarget,
    source: WebGLTexture,
    flip: number,
    alpha: number,
    over: boolean,
  ): void => {
    const program = activate(programs.copy)
    bindTarget(target, renderSize)
    blending(over)
    bindTextures(gl, program, { uSource: source })
    setUniforms(gl, program, { uFlipSource: flip, uAlpha: alpha })
    drawFullscreenTriangle(gl)
  }

  const copyInto = (target: RenderTarget, source: WebGLTexture): void => {
    drawCopy(target, source, TARGET_FLIP, 1, false)
  }

  const sdfFor = (platform: Platform): WebGLTexture | null => {
    const cached = sdfCache.get(platform)
    if (cached) return cached
    const texture = gl.createTexture()
    if (!texture) return null
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    // the three platform shapes are symmetric about both axes, so the y-down
    // sample grid from shapes.ts needs no flip here
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      SDF_SIZE,
      SDF_SIZE,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      sdfBytes(platform),
    )
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    sdfCache.set(platform, texture)
    return texture
  }

  /** Never trims below the current document's working set — see reserveRasterCache. */
  let textureBudget = MAX_LAYER_TEXTURES

  const trimLayerTextures = (): void => {
    while (layerTextures.size > Math.max(MAX_LAYER_TEXTURES, textureBudget)) {
      const oldest = layerTextures.keys().next()
      if (oldest.done) return
      const texture = layerTextures.get(oldest.value)
      layerTextures.delete(oldest.value)
      if (texture) gl.deleteTexture(texture)
    }
  }

  const schedule = (): void => {
    if (disposed || frame !== null) return
    if (typeof requestAnimationFrame !== 'function') return
    frame = requestAnimationFrame(() => {
      frame = null
      if (disposed || !lastDoc || !lastOptions) return
      draw(lastDoc, lastOptions)
    })
  }

  const uploadBitmap = (bitmap: ImageBitmap): WebGLTexture | null => {
    const texture = gl.createTexture()
    if (!texture) return null
    gl.bindTexture(gl.TEXTURE_2D, texture)
    // UNPACK_FLIP_Y_WEBGL and UNPACK_PREMULTIPLY_ALPHA_WEBGL are ignored for an
    // ImageBitmap source, so orientation and premultiplication are settled
    // elsewhere: raster.ts asks createImageBitmap for premultiplied output, and
    // the shaders flip v with uFlipSource = LAYER_FLIP when sampling this texture.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return texture
  }

  /** The layer's raster, kicking off rasterization and a redraw when missing. */
  const layerTexture = (
    layer: Layer,
    resolved: ResolvedLayer,
    rasterSize: number,
  ): WebGLTexture | null => {
    const key = rasterCacheKey(layer, resolved, rasterSize)
    const existing = layerTextures.get(key)
    if (existing) {
      layerTextures.delete(key)
      layerTextures.set(key, existing)
      return existing
    }
    if (!pending.has(key)) {
      pending.add(key)
      rasterizeLayer(layer, resolved, rasterSize)
        .then((bitmap) => {
          pending.delete(key)
          if (disposed) return
          const texture = uploadBitmap(bitmap)
          if (texture) {
            layerTextures.set(key, texture)
            trimLayerTextures()
          }
          contentDirty = true
          schedule()
        })
        .catch(() => {
          pending.delete(key)
        })
    }
    return null
  }

  /** Resolve and upload every raster the document needs, for a complete export. */
  const ensureRasters = async (doc: IconDoc, options: RenderOptions): Promise<void> => {
    textureBudget = layerBudget(doc)
    reserveRasterCache(textureBudget)
    const appearance = renditionPlan(options.rendition).appearance
    const rasterSize = rasterSizeFor(options.pixelRatio)
    const jobs: Array<Promise<void>> = []
    for (const group of doc.groups) {
      if (group.hidden || group.opacity <= 0) continue
      for (const layer of group.layers) {
        const resolved = resolveLayer(layer, appearance)
        if (resolved.hidden || resolved.opacity <= 0) continue
        const key = rasterCacheKey(layer, resolved, rasterSize)
        if (layerTextures.has(key)) continue
        jobs.push(
          rasterizeLayer(layer, resolved, rasterSize)
            .then((bitmap) => {
              if (disposed || layerTextures.has(key)) return
              const texture = uploadBitmap(bitmap)
              if (texture) {
                layerTextures.set(key, texture)
                trimLayerTextures()
              }
            })
            .catch(() => undefined),
        )
      }
    }
    await Promise.all(jobs)
  }

  /** `flip` applies to the horizontal pass only; the scratch it writes is v-up. */
  const blurInto = (
    output: RenderTarget,
    scratch: RenderTarget,
    source: WebGLTexture,
    radius: number,
    flip: number = TARGET_FLIP,
  ): void => {
    const program = activate(programs.blur)
    const texel = 1 / renderSize
    blending(false)
    bindTarget(scratch, renderSize)
    bindTextures(gl, program, { uSource: source })
    setUniforms(gl, program, {
      uDirection: [1, 0],
      uTexel: [texel, texel],
      uRadius: radius,
      uFlipSource: flip,
    })
    drawFullscreenTriangle(gl)
    bindTarget(output, renderSize)
    bindTextures(gl, program, { uSource: scratch.texture })
    setUniforms(gl, program, {
      uDirection: [0, 1],
      uTexel: [texel, texel],
      uRadius: radius,
      uFlipSource: TARGET_FLIP,
    })
    drawFullscreenTriangle(gl)
  }

  const drawGradient = (
    target: RenderTarget,
    size: number,
    a: Rgba,
    b: Rgba,
    p0: [number, number],
    p1: [number, number],
    over: boolean,
  ): void => {
    const program = activate(programs.background)
    bindTarget(target, size)
    blending(over)
    setUniforms(gl, program, {
      uMode: { int: 0 },
      uColorA: a,
      uColorB: b,
      uP0: p0,
      uP1: p1,
      uCheckerSize: 1,
      uResolution: [size, size],
    })
    drawFullscreenTriangle(gl)
  }

  /** Wallpaper into `target`, or into the already-set viewport when target is null. */
  const drawWallpaper = (
    target: RenderTarget | null,
    resolution: [number, number],
    options: RenderOptions,
  ): void => {
    const stops = wallpaperStops(options.wallpaper)
    const program = activate(programs.background)
    if (target) bindTarget(target, resolution[0])
    else gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    blending(false)
    const checker = stops === 'checker'
    setUniforms(gl, program, {
      uMode: { int: checker ? 1 : 0 },
      uColorA: checker ? [0.84, 0.84, 0.86, 1] : toRgba(stops[0]),
      uColorB: checker ? [0.97, 0.97, 0.98, 1] : toRgba(stops[1]),
      uP0: [0.5, 0],
      uP1: [0.5, 1],
      uCheckerSize: Math.max(4, Math.round((resolution[1] / CANVAS_SIZE) * 64)),
      uResolution: resolution,
    })
    drawFullscreenTriangle(gl)
  }

  const drawDocFill = (target: RenderTarget, doc: IconDoc, appearance: Appearance): void => {
    const fill = docFill(doc, appearance)
    if (fill.kind === 'none') return
    if (fill.kind === 'solid') {
      const c = toRgba(fill.color)
      drawGradient(target, renderSize, c, c, [0.5, 0], [0.5, 1], true)
      return
    }
    const stops =
      fill.kind === 'automatic-gradient' ? automaticGradientStops(fill.color) : fill.colors
    const angle = fill.kind === 'automatic-gradient' ? 0 : fill.angle
    const { p0, p1 } = gradientEndpoints(angle)
    drawGradient(target, renderSize, toRgba(stops[0]), toRgba(stops[1]), p0, p1, true)
  }

  const drawPlate = (target: RenderTarget, plate: Exclude<Plate, 'none'>, sdf: WebGLTexture) => {
    const program = activate(programs.plate)
    const scale = renderSize / CANVAS_SIZE
    bindTarget(target, renderSize)
    blending(true)
    bindTextures(gl, program, { uSdf: sdf })
    setUniforms(gl, program, {
      uPlateColor: PLATES[plate].body,
      uRimColor: PLATES[plate].rim,
      uSdfSpread: (SDF_SPREAD * renderSize) / SDF_SIZE,
      uRimWidth: PLATE_RIM_WIDTH * scale,
    })
    drawFullscreenTriangle(gl)
  }

  /** Composite one premultiplied source over `dest`, returning the new target. */
  const compositeOver = (
    dest: RenderTarget,
    source: WebGLTexture,
    opacity: number,
    blendMode: number,
    mono: { a: Rgba; b: Rgba } | null,
  ): RenderTarget => {
    const next = pool.acquire()
    if (!next) return dest
    const program = activate(programs.blend)
    bindTarget(next, renderSize)
    blending(false)
    bindTextures(gl, program, { uDest: dest.texture, uSource: source })
    setUniforms(gl, program, {
      // compositeOver is only ever handed a layer raster
      uFlipSource: LAYER_FLIP,
      uOpacity: opacity,
      uBlendMode: { int: blendMode },
      uMonoMode: { int: mono ? 1 : 0 },
      uMonoA: mono ? mono.a : [0, 0, 0, 0],
      uMonoB: mono ? mono.b : [0, 0, 0, 0],
    })
    drawFullscreenTriangle(gl)
    pool.release(dest)
    return next
  }

  const drawGlassPass = (
    scene: RenderTarget,
    group: Group,
    glass: Glass,
    textures: {
      groupTex: WebGLTexture
      glassMask: WebGLTexture
      blurAlpha: WebGLTexture
      normals: WebGLTexture
      sceneBlur: WebGLTexture
    },
    options: RenderOptions,
  ): RenderTarget => {
    const next = pool.acquire()
    if (!next) return scene
    const program = activate(programs.glass)
    const scale = renderSize / CANVAS_SIZE
    const texel = 1 / renderSize
    const angle = (options.lightAngle * Math.PI) / 180
    const lightXy: [number, number] = [Math.sin(angle), Math.cos(angle)]
    const lightLength = Math.hypot(lightXy[0], lightXy[1], LIGHT_ELEVATION)

    // base shadow offset is down-right at 1024, rotated clockwise with the light
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const dx = SHADOW_OFFSET * cos - SHADOW_OFFSET * sin
    const dy = SHADOW_OFFSET * sin + SHADOW_OFFSET * cos

    const shadowMode = glass.shadow.kind === 'none' ? 0 : glass.shadow.kind === 'neutral' ? 1 : 2
    const refractivity = glass.refractivity
    const refraction = refractivity?.enabled
      ? refractivity.strength * refractivity.depth * REFRACTION_MAX * scale
      : 0
    const placement = glass.specularPlacement ?? 'automatic'
    const specularShift =
      placement === 'inside'
        ? SPECULAR_SHIFT * scale
        : placement === 'outside'
          ? -SPECULAR_SHIFT * scale
          : 0

    bindTarget(next, renderSize)
    blending(false)
    bindTextures(gl, program, {
      uScene: scene.texture,
      uSceneBlur: textures.sceneBlur,
      uGroup: textures.groupTex,
      uBlurAlpha: textures.blurAlpha,
      uNormal: textures.normals,
      uGlassMask: textures.glassMask,
    })
    setUniforms(gl, program, {
      uTexel: [texel, texel],
      uShadowOffset: [dx / CANVAS_SIZE, -dy / CANVAS_SIZE],
      uShadowColor: [0, 0, 0],
      uShadowOpacity: glass.shadow.opacity,
      uShadowMode: { int: shadowMode },
      uTranslucency: glass.translucency.enabled ? glass.translucency.value : 0,
      uRefraction: refraction,
      uSpecular: glass.specular ? 1 : 0,
      uSpecularShift: specularShift,
      uLightDir: [
        lightXy[0] / lightLength,
        lightXy[1] / lightLength,
        LIGHT_ELEVATION / lightLength,
      ],
      uOpacity: group.opacity,
      uBlendMode: { int: BLEND_MODE_INDEX[group.blendMode] },
    })
    drawFullscreenTriangle(gl)
    pool.release(scene)
    return next
  }

  /** Build the group color, its glass-only alpha, and the blurred alpha field. */
  const buildGroup = (
    group: Group,
    rasterSize: number,
    mono: { a: Rgba; b: Rgba } | null,
    appearance: Appearance,
    blurRadius: number,
  ): { color: RenderTarget; glassMask: RenderTarget; blurAlpha: RenderTarget } | null => {
    let color = pool.acquire()
    const glassMask = pool.acquire()
    const blurAlpha = pool.acquire()
    const scratch = pool.acquire()
    if (!color || !glassMask || !blurAlpha || !scratch) {
      pool.release(color, glassMask, blurAlpha, scratch)
      return null
    }
    clearTarget(color)
    clearTarget(glassMask)
    clearTarget(blurAlpha)

    const bottomToTop = [...group.layers].reverse()
    const glassLayers: WebGLTexture[] = []
    for (const layer of bottomToTop) {
      const resolved = resolveLayer(layer, appearance)
      if (resolved.hidden || resolved.opacity <= 0) continue
      const texture = layerTexture(layer, resolved, rasterSize)
      if (!texture) continue
      color = compositeOver(
        color,
        texture,
        resolved.opacity,
        BLEND_MODE_INDEX[resolved.blendMode],
        mono,
      )
      if (!layer.glass) continue
      glassLayers.push(texture)
      // the mask is coverage, so it carries the same opacity the color pass used
      drawCopy(glassMask, texture, LAYER_FLIP, resolved.opacity, true)
    }

    if (group.glass.lighting === 'combined' || glassLayers.length <= 1) {
      blurInto(blurAlpha, scratch, glassMask.texture, blurRadius)
    } else {
      // individual: blur each layer on its own and keep the brightest alpha
      const single = pool.acquire()
      if (single) {
        for (const texture of glassLayers) {
          blurInto(single, scratch, texture, blurRadius, LAYER_FLIP)
          const program = activate(programs.copy)
          bindTarget(blurAlpha, renderSize)
          gl.enable(gl.BLEND)
          gl.blendEquation(gl.MAX)
          gl.blendFunc(gl.ONE, gl.ONE)
          bindTextures(gl, program, { uSource: single.texture })
          setUniforms(gl, program, { uFlipSource: TARGET_FLIP, uAlpha: 1 })
          drawFullscreenTriangle(gl)
          gl.blendEquation(gl.FUNC_ADD)
        }
        pool.release(single)
      } else {
        blurInto(blurAlpha, scratch, glassMask.texture, blurRadius)
      }
    }
    pool.release(scratch)
    return { color, glassMask, blurAlpha }
  }

  /**
   * Run the whole pipeline and return the composited scene plus the wallpaper.
   * `transparent` (PNG export) starts from an empty backdrop instead of the
   * wallpaper, so nothing of the preview background ends up in the exported icon.
   */
  const renderScene = (
    doc: IconDoc,
    options: RenderOptions,
    transparent: boolean,
  ): { scene: RenderTarget; backdrop: RenderTarget } | null => {
    const plan = renditionPlan(options.rendition)
    const rasterSize = rasterSizeFor(options.pixelRatio)
    const scale = renderSize / CANVAS_SIZE
    const sdf = sdfFor(options.platform)
    const backdrop = pool.acquire()
    let scene = pool.acquire()
    if (!backdrop || !scene || !sdf) {
      pool.release(backdrop, scene)
      return null
    }

    if (transparent) {
      clearTarget(backdrop)
      clearTarget(scene)
    } else {
      drawWallpaper(backdrop, [renderSize, renderSize], options)
      copyInto(scene, backdrop.texture)
    }

    if (plan.usesDocFill) {
      drawDocFill(scene, doc, plan.appearance)
    } else if (plan.plate !== 'none') {
      drawPlate(scene, plan.plate, sdf)
    }

    const mono = plan.monoFromLuminance
      ? {
          a: toRgba(monoColor(0, options.rendition, options.tint)),
          b: toRgba(monoColor(1, options.rendition, options.tint)),
        }
      : null

    const sceneBlur = pool.acquire()
    const scratch = pool.acquire()
    const normals = pool.acquire()
    if (!sceneBlur || !scratch || !normals) {
      pool.release(sceneBlur, scratch, normals)
      return { scene, backdrop }
    }

    for (const group of [...doc.groups].reverse()) {
      if (group.hidden || group.opacity <= 0 || group.layers.length === 0) continue
      const blurRadius = (BLUR_BASE + group.glass.blurMaterial * BLUR_RANGE) * scale
      const built = buildGroup(group, rasterSize, mono, plan.appearance, Math.max(1, blurRadius))
      if (!built) continue

      const normalProgram = activate(programs.normals)
      bindTarget(normals, renderSize)
      blending(false)
      bindTextures(gl, normalProgram, { uAlpha: built.blurAlpha.texture })
      setUniforms(gl, normalProgram, {
        uTexel: [1 / renderSize, 1 / renderSize],
        uHeight: NORMAL_HEIGHT,
      })
      drawFullscreenTriangle(gl)

      if (group.glass.translucency.enabled) {
        blurInto(sceneBlur, scratch, scene.texture, Math.max(1, blurRadius))
      } else {
        copyInto(sceneBlur, scene.texture)
      }

      if (group.glass.shadow.kind === 'layer-color') {
        gl.bindTexture(gl.TEXTURE_2D, built.color.texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.generateMipmap(gl.TEXTURE_2D)
      }

      scene = drawGlassPass(
        scene,
        group,
        group.glass,
        {
          groupTex: built.color.texture,
          glassMask: built.glassMask.texture,
          blurAlpha: built.blurAlpha.texture,
          normals: normals.texture,
          sceneBlur: sceneBlur.texture,
        },
        options,
      )

      if (group.glass.shadow.kind === 'layer-color') {
        gl.bindTexture(gl.TEXTURE_2D, built.color.texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      }
      pool.release(built.color, built.glassMask, built.blurAlpha)
    }

    pool.release(sceneBlur, scratch, normals)
    return { scene, backdrop }
  }

  const drawMask = (
    scene: WebGLTexture,
    backdrop: WebGLTexture,
    sdf: WebGLTexture,
    size: number,
    transparent: boolean,
  ): void => {
    const program = activate(programs.mask)
    blending(false)
    bindTextures(gl, program, { uScene: scene, uBackdrop: backdrop, uSdf: sdf })
    setUniforms(gl, program, {
      uSdfSpread: (SDF_SPREAD * size) / SDF_SIZE,
      uFeather: 0.5,
      uTransparent: transparent ? 1 : 0,
    })
    drawFullscreenTriangle(gl)
  }

  const draw = (doc: IconDoc, options: RenderOptions): void => {
    if (disposed) return
    textureBudget = layerBudget(doc)
    reserveRasterCache(textureBudget)
    const ratio = options.pixelRatio || 1
    const width = Math.max(1, Math.round(cssWidth * ratio))
    const height = Math.max(1, Math.round(cssHeight * ratio))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const square = Math.max(1, Math.min(width, height))
    // the pool drops every target when the size changes, so the cache goes too
    if (square !== renderSize) invalidate()
    renderSize = square
    pool.resize(square, square)

    const sdf = sdfFor(options.platform)
    if (!sdf) return
    const key = pipelineKey(options, square)

    gl.bindVertexArray(vao)
    if (contentDirty || !cached || cachedDoc !== doc || cachedKey !== key) {
      if (cached) pool.release(cached.scene, cached.backdrop)
      cached = renderScene(doc, options, false)
      cachedDoc = doc
      cachedKey = key
      contentDirty = false
    }
    if (!cached) {
      gl.bindVertexArray(null)
      return
    }

    // always re-blit: the drawing buffer is cleared after every composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, width, height)
    drawWallpaper(null, [width, height], options)
    gl.viewport(Math.round((width - square) / 2), Math.round((height - square) / 2), square, square)
    drawMask(cached.scene.texture, cached.backdrop.texture, sdf, square, false)
    gl.bindVertexArray(null)
  }

  const readTargetToBlob = async (target: RenderTarget, size: number): Promise<Blob> => {
    const pixels = new Uint8ClampedArray(size * size * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    // GL rows come back bottom-up
    const flipped = new Uint8ClampedArray(pixels.length)
    const stride = size * 4
    for (let y = 0; y < size; y++) {
      flipped.set(pixels.subarray((size - 1 - y) * stride, (size - y) * stride), y * stride)
    }

    // the framebuffer is premultiplied; putImageData expects straight alpha
    for (let i = 0; i < flipped.length; i += 4) {
      const a = flipped[i + 3] as number
      if (a === 0 || a === 255) continue
      const scale = 255 / a
      flipped[i] = Math.min(255, Math.round((flipped[i] as number) * scale))
      flipped[i + 1] = Math.min(255, Math.round((flipped[i + 1] as number) * scale))
      flipped[i + 2] = Math.min(255, Math.round((flipped[i + 2] as number) * scale))
    }

    if (typeof OffscreenCanvas !== 'undefined') {
      const off = new OffscreenCanvas(size, size)
      const ctx = off.getContext('2d')
      if (!ctx) throw new Error('toBlob could not acquire a 2d context')
      ctx.putImageData(new ImageData(flipped, size, size), 0, 0)
      return off.convertToBlob({ type: 'image/png' })
    }
    if (typeof document === 'undefined') throw new Error('toBlob requires a browser environment')
    const temp = document.createElement('canvas')
    temp.width = size
    temp.height = size
    const ctx = temp.getContext('2d')
    if (!ctx) throw new Error('toBlob could not acquire a 2d context')
    ctx.putImageData(new ImageData(flipped, size, size), 0, 0)
    return new Promise<Blob>((resolve, reject) => {
      temp.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/png',
      )
    })
  }

  const renderer: Renderer = {
    kind: 'gl',
    render(doc, options) {
      lastDoc = doc
      lastOptions = options
      draw(doc, options)
    },
    async toBlob(doc, options, size) {
      const target = Math.max(1, Math.round(size))
      await ensureRasters(doc, options)
      const previous = renderSize
      invalidate()
      renderSize = target
      pool.resize(target, target)
      gl.bindVertexArray(vao)
      try {
        // the exported PNG is an icon image, never a screenshot of the preview:
        // no wallpaper, and transparent outside the platform mask
        const result = renderScene(doc, options, true)
        const sdf = sdfFor(options.platform)
        const out = pool.acquire()
        if (!result || !sdf || !out) throw new Error('toBlob could not allocate render targets')
        bindTarget(out, target)
        drawMask(result.scene.texture, result.backdrop.texture, sdf, target, true)
        const blob = await readTargetToBlob(out, target)
        pool.release(result.scene, result.backdrop, out)
        return blob
      } finally {
        gl.bindVertexArray(null)
        invalidate()
        renderSize = previous
        pool.resize(previous, previous)
        if (lastDoc && lastOptions) schedule()
      }
    },
    resize(width, height) {
      cssWidth = Math.max(1, width)
      cssHeight = Math.max(1, height)
      if (lastDoc && lastOptions) draw(lastDoc, lastOptions)
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      frame = null
      invalidate()
      pool.dispose()
      for (const texture of layerTextures.values()) gl.deleteTexture(texture)
      layerTextures.clear()
      for (const texture of sdfCache.values()) gl.deleteTexture(texture)
      sdfCache.clear()
      for (const program of Object.values(programs)) if (program) gl.deleteProgram(program)
      if (vao) gl.deleteVertexArray(vao)
      lastDoc = null
      lastOptions = null
    },
  }

  return renderer
}
