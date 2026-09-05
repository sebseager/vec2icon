/** GLSL ES 3.00 sources for the Liquid-Glass approximation.
 *
 * Every intermediate framebuffer holds premultiplied RGBA8 oriented v-up, so the
 * final pass can draw straight to the default framebuffer.
 *
 * Layer rasters are the exception: they arrive as `ImageBitmap`s with a y-down
 * origin, and `UNPACK_FLIP_Y_WEBGL` has no effect on an ImageBitmap upload (the
 * WebGL spec ignores it for that source type), so every shader that samples a
 * layer texture flips v itself via `sourceUv()` with `uFlipSource = 1`. Shaders
 * that only ever read render targets pass 0 (or omit the chunk entirely).
 */
import type { BlendMode } from '../../model/types'

/** Index of each blend mode in the `blendRgb` switch below. */
export const BLEND_MODE_INDEX: Record<BlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
  'color-dodge': 6,
  'color-burn': 7,
  'hard-light': 8,
  'soft-light': 9,
  difference: 10,
  exclusion: 11,
  hue: 12,
  saturation: 13,
  color: 14,
  luminosity: 15,
  'plus-darker': 16,
  'plus-lighter': 17,
}

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
`

/**
 * Source sampling that accounts for layer rasters being y-down while every render
 * target is v-up. `uFlipSource` is 1 for a layer texture and 0 for a render target.
 */
const SOURCE_UV_CHUNK = `
uniform float uFlipSource;
// With uSourceWarp set, the (canvas-normalised) sample point is mapped through
// uSourceMatrix first, so a raster drawn at an older transform can stand in for the
// layer at its current one. Uniforms default to zero, so programs that never set
// uSourceWarp sample straight through.
uniform float uSourceWarp;
uniform mat3 uSourceMatrix;

vec2 sourceUv() {
  vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipSource));
  if (uSourceWarp > 0.5) uv = (uSourceMatrix * vec3(uv, 1.0)).xy;
  return uv;
}

// Zero outside the source when warping, so clamp-to-edge never smears its border.
float sourceInside(vec2 uv) {
  if (uSourceWarp < 0.5) return 1.0;
  return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
}
`

/** JS mirror of `sourceUv()`, so the convention can be unit tested. */
export const flipSourceUv = (u: number, v: number, flip: boolean): [number, number] => [
  u,
  flip ? 1 - v : v,
]

/** Separable and non-separable blend functions plus premultiplied compositing. */
const BLEND_CHUNK = `
float blendChannel(int mode, float b, float s) {
  if (mode == 1) return b * s;
  if (mode == 2) return b + s - b * s;
  if (mode == 3) return b <= 0.5 ? 2.0 * b * s : 1.0 - 2.0 * (1.0 - b) * (1.0 - s);
  if (mode == 4) return min(b, s);
  if (mode == 5) return max(b, s);
  if (mode == 6) return b <= 0.0 ? 0.0 : (s >= 1.0 ? 1.0 : min(1.0, b / (1.0 - s)));
  if (mode == 7) return b >= 1.0 ? 1.0 : (s <= 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / s));
  if (mode == 8) return s <= 0.5 ? 2.0 * s * b : 1.0 - 2.0 * (1.0 - s) * (1.0 - b);
  if (mode == 9) {
    float d = b <= 0.25 ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b);
    return s <= 0.5 ? b - (1.0 - 2.0 * s) * b * (1.0 - b) : b + (2.0 * s - 1.0) * (d - b);
  }
  if (mode == 10) return abs(b - s);
  if (mode == 11) return b + s - 2.0 * b * s;
  return s;
}

float nsLum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

vec3 clipColor(vec3 c) {
  float l = nsLum(c);
  float lo = min(c.r, min(c.g, c.b));
  float hi = max(c.r, max(c.g, c.b));
  if (lo < 0.0) c = l + (c - l) * (l / max(l - lo, 1e-5));
  if (hi > 1.0) c = l + (c - l) * ((1.0 - l) / max(hi - l, 1e-5));
  return c;
}

vec3 setLum(vec3 c, float l) { return clipColor(c + (l - nsLum(c))); }

float nsSat(vec3 c) { return max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); }

vec3 setSat(vec3 c, float s) {
  float lo = min(c.r, min(c.g, c.b));
  float hi = max(c.r, max(c.g, c.b));
  float d = hi - lo;
  return d > 0.0 ? (c - lo) * (s / d) : vec3(0.0);
}

vec3 blendRgb(int mode, vec3 cb, vec3 cs) {
  if (mode == 12) return setLum(setSat(cs, nsSat(cb)), nsLum(cb));
  if (mode == 13) return setLum(setSat(cb, nsSat(cs)), nsLum(cb));
  if (mode == 14) return setLum(cs, nsLum(cb));
  if (mode == 15) return setLum(cb, nsLum(cs));
  return vec3(
    blendChannel(mode, cb.r, cs.r),
    blendChannel(mode, cb.g, cs.g),
    blendChannel(mode, cb.b, cs.b)
  );
}

/** Premultiplied source over premultiplied destination with a blend mode. */
vec4 compositeBlend(int mode, vec4 dst, vec4 src) {
  if (mode == 17) return clamp(dst + src, 0.0, 1.0);
  if (mode == 16) return clamp(vec4(dst.rgb + src.rgb - 1.0, dst.a + src.a), 0.0, 1.0);
  vec3 cb = dst.rgb / max(dst.a, 1e-5);
  vec3 cs = src.rgb / max(src.a, 1e-5);
  vec3 blended = blendRgb(mode, cb, cs);
  vec3 co = (1.0 - dst.a) * src.rgb + (1.0 - src.a) * dst.rgb + src.a * dst.a * blended;
  return vec4(co, src.a + dst.a * (1.0 - src.a));
}
`

/** Rec. 709 luminance on linearized sRGB — mirrors core/render/luminance.ts. */
const LUMINANCE_CHUNK = `
float srgbToLinear(float c) {
  return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4);
}

float relativeLuminance(vec3 c) {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}
`

/** Attributeless full-screen triangle; vUv spans the unit square with v up. */
export const VERTEX_FULLSCREEN = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 1), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

/**
 * Wallpaper, solid fill, automatic/linear gradient, or a checkerboard.
 * uMode: 0 = two-stop gradient along uP0 -> uP1, 1 = checker.
 */
export const FRAG_BACKGROUND = `${HEADER}
uniform int uMode;
uniform vec4 uColorA;
uniform vec4 uColorB;
uniform vec2 uP0;
uniform vec2 uP1;
uniform float uCheckerSize;
uniform vec2 uResolution;

void main() {
  if (uMode == 1) {
    vec2 cell = floor(vUv * uResolution / max(uCheckerSize, 1.0));
    float odd = mod(cell.x + cell.y, 2.0);
    vec3 c = mix(uColorA.rgb, uColorB.rgb, odd);
    outColor = vec4(c, 1.0);
    return;
  }
  vec2 axis = uP1 - uP0;
  float len2 = max(dot(axis, axis), 1e-6);
  float t = clamp(dot(vUv - uP0, axis) / len2, 0.0, 1.0);
  vec4 c = mix(uColorA, uColorB, t);
  outColor = vec4(c.rgb * c.a, c.a);
}
`

/** Separable Gaussian; uDirection is (1,0) or (0,1), uRadius is in pixels. */
export const FRAG_BLUR = `${HEADER}
${SOURCE_UV_CHUNK}
uniform sampler2D uSource;
uniform vec2 uDirection;
uniform vec2 uTexel;
uniform float uRadius;

void main() {
  vec2 uv = sourceUv();
  float radius = max(uRadius, 0.0);
  if (radius < 0.5) {
    outColor = texture(uSource, uv);
    return;
  }
  float sigma = max(radius * 0.5, 1e-3);
  float stride = radius / 7.0;
  vec4 sum = vec4(0.0);
  float weightSum = 0.0;
  // the kernel is symmetric, so a flipped source needs no sign change here
  for (int i = -7; i <= 7; i++) {
    float offset = float(i) * stride;
    float w = exp(-0.5 * (offset * offset) / (sigma * sigma));
    sum += texture(uSource, uv + uDirection * offset * uTexel) * w;
    weightSum += w;
  }
  outColor = sum / weightSum;
}
`

/**
 * Surface normals from the gradient of a blurred alpha field.
 * rgb holds the normal encoded to 0..1, a keeps the blurred alpha.
 */
export const FRAG_NORMALS = `${HEADER}
uniform sampler2D uAlpha;
uniform vec2 uTexel;
uniform float uHeight;

void main() {
  float ax = texture(uAlpha, vUv + vec2(uTexel.x, 0.0)).a
           - texture(uAlpha, vUv - vec2(uTexel.x, 0.0)).a;
  float ay = texture(uAlpha, vUv + vec2(0.0, uTexel.y)).a
           - texture(uAlpha, vUv - vec2(0.0, uTexel.y)).a;
  // alpha grows toward the interior, so the outward normal opposes the gradient
  vec3 n = normalize(vec3(-ax * uHeight, -ay * uHeight, 1.0));
  outColor = vec4(n * 0.5 + 0.5, texture(uAlpha, vUv).a);
}
`

/**
 * Composites one premultiplied source over a destination with a blend mode and
 * opacity, optionally remapping the source through the Mono luminance ramp
 * (uMonoMode 1: mix(uMonoA, uMonoB, luminance)).
 */
export const FRAG_BLEND = `${HEADER}
${SOURCE_UV_CHUNK}
${BLEND_CHUNK}
${LUMINANCE_CHUNK}
uniform sampler2D uDest;
uniform sampler2D uSource;
uniform float uOpacity;
uniform int uBlendMode;
uniform int uMonoMode;
uniform vec4 uMonoA;
uniform vec4 uMonoB;

void main() {
  vec4 dst = texture(uDest, vUv);
  vec4 src = texture(uSource, sourceUv());
  if (uMonoMode == 1 && src.a > 0.0) {
    float l = relativeLuminance(clamp(src.rgb / src.a, 0.0, 1.0));
    vec4 mono = mix(uMonoA, uMonoB, l);
    float a = mono.a * src.a;
    src = vec4(mono.rgb * a, a);
  }
  src *= clamp(uOpacity, 0.0, 1.0);
  outColor = compositeBlend(uBlendMode, dst, src);
}
`

/**
 * The glass pass for one group: drop shadow, translucency against the blurred
 * backdrop, refraction along the normal field, and a specular rim on the side
 * facing the light, then composites the result over the scene with the group
 * blend mode.
 */
export const FRAG_GLASS = `${HEADER}
${BLEND_CHUNK}
uniform sampler2D uScene;
uniform sampler2D uSceneBlur;
uniform sampler2D uGroup;
uniform sampler2D uBlurAlpha;
uniform sampler2D uNormal;
uniform sampler2D uGlassMask;
uniform vec2 uTexel;
uniform vec2 uShadowOffset;
uniform vec3 uShadowColor;
uniform float uShadowOpacity;
uniform int uShadowMode;
uniform float uTranslucency;
uniform float uRefraction;
uniform float uSpecular;
uniform float uSpecularShift;
uniform vec3 uLightDir;
uniform float uOpacity;
uniform int uBlendMode;

void main() {
  vec4 scene = texture(uScene, vUv);

  // 1. shadow: the blurred glass alpha, offset away from the light.
  // uShadowMode 2 tints it with the group mean color, read from the coarsest mip.
  if (uShadowMode > 0 && uShadowOpacity > 0.0) {
    vec3 shadowRgb = uShadowColor;
    if (uShadowMode == 2) {
      vec4 mean = textureLod(uGroup, vec2(0.5), 12.0);
      if (mean.a > 0.002) shadowRgb = mean.rgb / mean.a;
    }
    float sa = texture(uBlurAlpha, vUv - uShadowOffset).a * uShadowOpacity;
    vec4 shadow = vec4(shadowRgb * sa, sa);
    scene = vec4(shadow.rgb + scene.rgb * (1.0 - shadow.a), shadow.a + scene.a * (1.0 - shadow.a));
  }

  vec4 group = texture(uGroup, vUv);
  if (group.a <= 0.0) {
    outColor = scene;
    return;
  }
  vec3 groupColor = group.rgb / group.a;
  float glassy = clamp(texture(uGlassMask, vUv).a / group.a, 0.0, 1.0);
  vec3 n = normalize(texture(uNormal, vUv).rgb * 2.0 - 1.0);

  // 2. refraction: displace the backdrop sample along the surface normal
  vec2 refracted = vUv + n.xy * uRefraction * glassy * uTexel;

  // 3. translucency: pull the (refracted) blurred backdrop through the glass
  vec3 blurredBackdrop = texture(uSceneBlur, refracted).rgb;
  vec3 body = mix(groupColor, mix(groupColor, blurredBackdrop, 0.7), uTranslucency * glassy);

  // 4. specular rim: brightest where the surface faces the light, banded to the
  // blurred edge, plus a very faint uniform rim so the away side still reads as glass
  float spec = 0.0;
  if (uSpecular > 0.0) {
    float band = texture(uBlurAlpha, vUv + n.xy * uSpecularShift * uTexel).a;
    float edge = smoothstep(0.05, 0.4, band) * (1.0 - smoothstep(0.55, 0.95, band));
    float facing = pow(max(dot(n, uLightDir), 0.0), 3.0);
    spec = uSpecular * edge * (facing + 0.08) * glassy;
  }

  float alpha = group.a * clamp(uOpacity, 0.0, 1.0);
  vec3 lit = clamp(body + vec3(spec), 0.0, 1.0);
  vec4 src = vec4(lit * alpha, alpha);
  outColor = compositeBlend(uBlendMode, scene, src);
}
`

/**
 * Clear / Tinted plate with a faint rim, emitted premultiplied so the caller
 * blends it over the scene with (ONE, ONE_MINUS_SRC_ALPHA).
 */
export const FRAG_PLATE = `${HEADER}
uniform sampler2D uSdf;
uniform vec4 uPlateColor;
uniform vec4 uRimColor;
uniform float uSdfSpread;
uniform float uSdfMargin;
uniform float uRimWidth;

void main() {
  vec2 sdfUv = (vUv + uSdfMargin) / (1.0 + 2.0 * uSdfMargin);
  float d = (texture(uSdf, sdfUv).r * 2.0 - 1.0) * uSdfSpread;
  float coverage = 1.0 - smoothstep(-0.5, 0.5, d);
  float rim = (1.0 - smoothstep(0.0, uRimWidth, abs(d + uRimWidth * 0.5))) * coverage;

  vec4 plate = vec4(uPlateColor.rgb * uPlateColor.a, uPlateColor.a) * coverage;
  float ra = uRimColor.a * rim;
  outColor = vec4(uRimColor.rgb * ra + plate.rgb * (1.0 - ra), ra + plate.a * (1.0 - ra));
}
`

/**
 * Final pass. With `uTransparent = 0` (interactive preview) the composited icon is
 * drawn inside the platform mask over the wallpaper, opaque everywhere. With
 * `uTransparent = 1` (PNG export) the wallpaper is not mixed in at all and alpha
 * becomes the mask coverage, so the icon is transparent outside its shape.
 */
export const FRAG_MASK = `${HEADER}
uniform sampler2D uScene;
uniform sampler2D uBackdrop;
uniform sampler2D uSdf;
uniform float uSdfSpread;
uniform float uSdfMargin;
uniform float uFeather;
uniform float uTransparent;

void main() {
  vec4 scene = texture(uScene, vUv);
  vec4 backdrop = texture(uBackdrop, vUv);
  // the SDF texture covers the canvas plus a margin, so its edge never clamps
  vec2 sdfUv = (vUv + uSdfMargin) / (1.0 + 2.0 * uSdfMargin);
  float d = (texture(uSdf, sdfUv).r * 2.0 - 1.0) * uSdfSpread;
  float coverage = 1.0 - smoothstep(-uFeather, uFeather, d);
  if (uTransparent > 0.5) {
    // scene is premultiplied, so masking is a straight multiply on all four channels
    outColor = scene * coverage;
    return;
  }
  outColor = vec4(mix(backdrop.rgb, scene.rgb, coverage), 1.0);
}
`

/**
 * Straight copy at `uAlpha` opacity, used to seed and clone scene targets and to
 * accumulate the glass coverage mask. Premultiplied, so scaling all four channels
 * by `uAlpha` is the correct opacity multiply.
 */
export const FRAG_COPY = `${HEADER}
${SOURCE_UV_CHUNK}
uniform sampler2D uSource;
uniform float uAlpha;
void main() {
  vec2 uv = sourceUv();
  outColor = texture(uSource, uv) * uAlpha * sourceInside(uv);
}
`
