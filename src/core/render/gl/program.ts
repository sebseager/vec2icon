/** Small WebGL2 helpers: program compilation, uniforms, and a render-target pool.
 *
 * Nothing here touches the DOM, so the module imports cleanly outside a browser;
 * every entry point takes an already-acquired WebGL2RenderingContext.
 */

export const compileShader = (
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export const createProgram = (
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!vertex || !fragment) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    return null
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

/** A float, a float vector, or an explicit integer (`{ int: n }`). */
export type UniformValue = number | readonly number[] | { int: number }

const uniformCaches = new WeakMap<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

const locationOf = (
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
): WebGLUniformLocation | null => {
  let cache = uniformCaches.get(program)
  if (!cache) {
    cache = new Map()
    uniformCaches.set(program, cache)
  }
  if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name))
  return cache.get(name) ?? null
}

export const setUniforms = (
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  values: Record<string, UniformValue>,
): void => {
  for (const [name, value] of Object.entries(values)) {
    const location = locationOf(gl, program, name)
    if (!location) continue
    if (typeof value === 'number') {
      gl.uniform1f(location, value)
    } else if (Array.isArray(value)) {
      if (value.length === 2) gl.uniform2f(location, value[0] as number, value[1] as number)
      else if (value.length === 3)
        gl.uniform3f(location, value[0] as number, value[1] as number, value[2] as number)
      else if (value.length === 4)
        gl.uniform4f(
          location,
          value[0] as number,
          value[1] as number,
          value[2] as number,
          value[3] as number,
        )
      else gl.uniform1f(location, value[0] as number)
    } else {
      gl.uniform1i(location, (value as { int: number }).int)
    }
  }
}

/** Bind textures to sequential units and point the matching samplers at them. */
export const bindTextures = (
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  textures: Record<string, WebGLTexture | null>,
): void => {
  let unit = 0
  for (const [name, texture] of Object.entries(textures)) {
    const location = locationOf(gl, program, name)
    if (!location) continue
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(location, unit)
    unit++
  }
}

export const createTexture = (
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture | null => {
  const texture = gl.createTexture()
  if (!texture) return null
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return texture
}

export type RenderTarget = { texture: WebGLTexture; framebuffer: WebGLFramebuffer }

/** Reusable RGBA8 render targets, all at the current render size. */
export class TargetPool {
  private free: RenderTarget[] = []
  private all: RenderTarget[] = []
  private width = 0
  private height = 0

  constructor(private readonly gl: WebGL2RenderingContext) {}

  /** Drop every target when the render size changes. */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return
    this.dispose()
    this.width = width
    this.height = height
  }

  acquire(): RenderTarget | null {
    const reused = this.free.pop()
    if (reused) return reused
    const gl = this.gl
    const texture = createTexture(gl, this.width, this.height)
    const framebuffer = gl.createFramebuffer()
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture)
      if (framebuffer) gl.deleteFramebuffer(framebuffer)
      return null
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const target = { texture, framebuffer }
    this.all.push(target)
    return target
  }

  release(...targets: Array<RenderTarget | null>): void {
    for (const target of targets) {
      if (target && !this.free.includes(target)) this.free.push(target)
    }
  }

  dispose(): void {
    const gl = this.gl
    for (const target of this.all) {
      gl.deleteTexture(target.texture)
      gl.deleteFramebuffer(target.framebuffer)
    }
    this.all = []
    this.free = []
  }
}

/** Draw the attributeless full-screen triangle into the bound framebuffer. */
export const drawFullscreenTriangle = (gl: WebGL2RenderingContext): void => {
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}
