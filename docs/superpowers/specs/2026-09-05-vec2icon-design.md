# vec2icon design

Browser app that turns one or more SVGs into an Apple Icon Composer `.icon` bundle.
Everything runs client-side.

## Goals

- Import SVG(s), split into layers, let the user reorder, transform and group them.
- Approximate Liquid Glass preview across all six renditions, labelled approximate.
- Export a valid `.icon` bundle that Xcode 26/27 accepts, plus a flat PNG and a
  cleaned combined SVG.
- Every change is a user choice and is undoable and redoable. Terse UI text; long
  explanations live in help bubbles.

## Non-goals (v1)

PDF/AI/EPS import, per-appearance position overrides, localization and RTL
mirroring, per-idiom overrides, opening existing `.icon` bundles, legacy
`.appiconset` output, matching the iOS 27 design generation exactly, converting
text to outlines.

## Stack

pnpm, Vite 8, React 19, TypeScript 7, Tailwind 4, Vitest 5 + happy-dom, Biome 2.
zustand 5 + zundo (history). @dnd-kit/core + @dnd-kit/sortable. @base-ui/react
for popover, slider, select, tooltip, menu. lucide-react icons. fflate for zip.
ajv is a dev dependency used only in tests. Static deployment.

## Repository layout

```
src/
  core/                framework-free, unit tested
    svg/               parse, styles, split, defs, bbox, sanitize, lint, background
    model/             types, doc operations, appearance resolution
    export/            iconjson, bundle (zip), png, combined-svg, color
    render/            raster (svg -> bitmap), shapes (masks), gl/ (renderer, shaders), flat
  state/               zustand store, history, persistence (IndexedDB)
  ui/                  React: App, TopBar, LayersPanel, Canvas, Inspector, Issues, Help
  main.tsx
docs/superpowers/      specs and plans
```

`src/core` must not import React or anything from `src/state` or `src/ui`.

## Document model

```ts
type Appearance = 'default' | 'dark' | 'mono'
type Rendition = 'default' | 'dark' | 'clearLight' | 'clearDark' | 'tintedLight' | 'tintedDark'

type Color = { space: 'srgb' | 'display-p3' | 'gray'; components: number[] } // 0..1, alpha last

type Fill =
  | { kind: 'none' }
  | { kind: 'solid'; color: Color }
  | { kind: 'automatic-gradient'; color: Color }
  | { kind: 'linear-gradient'; colors: [Color, Color]; angle: number } // degrees, 0 = bottom->top

type Transform = { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
// x,y in canvas points relative to canvas center; scale multiplies the fitted import size

type LayerOverride = { fill?: Fill; opacity?: number; hidden?: boolean; blendMode?: BlendMode }

type Layer = {
  id: string; name: string
  svg: string          // sanitized fragment: <g>...</g> in source user units
  defs: string         // referenced <defs> children, transitive
  sourceViewBox: [number, number, number, number]
  bbox: { x: number; y: number; width: number; height: number }
  transform: Transform
  opacity: number; blendMode: BlendMode; glass: boolean; hidden: boolean
  overrides: Partial<Record<'dark' | 'mono', LayerOverride>>
  issues: Issue[]
}

type Glass = {
  lighting: 'individual' | 'combined'
  specular: boolean
  specularPlacement?: 'automatic' | 'inside' | 'outside'  // IC2 only
  blurMaterial: number
  refractivity?: { enabled: boolean; strength: number; depth: number } // IC2 only
  translucency: { enabled: boolean; value: number }
  shadow: { kind: 'neutral' | 'layer-color' | 'none'; opacity: number }
}

type Group = { id: string; name: string; layers: Layer[]; glass: Glass;
               opacity: number; blendMode: BlendMode; hidden: boolean }

type IconDoc = {
  name: string
  fill: { default: Fill; dark?: Fill }
  watchOS: boolean
  groups: Group[]     // bottom-most first, matching icon.json order reversed for display
}
```

Canvas is 1024 x 1024 points. The Default appearance is the base; Dark and Mono
override it per layer. Clear and Tinted renditions read Mono values. When a layer has
no Mono fill override, its Mono luminance is computed from the rasterized Default
appearance.

Defaults for a new group: lighting individual, specular on, blurMaterial 0.5,
translucency enabled 0.5, shadow neutral 0.5, no refractivity.

## Import pipeline

1. Accept `.svg` and `.svgz` (inflate with fflate) via drop zone or picker, many at once.
2. Parse with `DOMParser` as `image/svg+xml`. Reject documents with parse errors,
   `<script>`, `<foreignObject>`, event handler attributes, or external `href`s.
   Rejections surface as a toast naming the file.
3. Style resolution: collect `<style>` text, parse into `(selector, declarations)`
   rules with a small parser, apply in specificity order to elements via
   `Element.matches`, writing results as presentation attributes. Inline `style=""`
   wins. Remove `<style>` and `class` afterwards. Only presentation properties are
   handled (fill, stroke, opacity, *-opacity, stroke-*, fill-rule, clip-rule,
   display, visibility, transform).
4. Split: for a single file, each renderable direct child of the root `<svg>`
   becomes a layer, keeping its own `transform`. `<defs>`, `<metadata>`, `<title>`,
   `<desc>`, `<style>` are skipped. Nested `<svg>` is treated as a group. For
   multiple files, each file becomes one layer. Layer name comes from `id`, then
   `<title>`, then `inkscape:label`, then `Layer N`.
5. Defs: collect ids referenced by `url(#id)` and `href="#id"` transitively; copy
   those nodes into the layer's `defs`. Ids are prefixed per layer on export to
   avoid collisions in the combined SVG.
6. Bounding box: measured by mounting the fragment in a hidden `<svg>` and calling
   `getBBox`. The import fit scales the source viewBox to 1024 preserving aspect
   ratio and centers it; a layer's `Transform` starts at identity relative to that fit.
7. Lint (see below) runs per layer and per document.

Split and Merge are layer actions: Split turns a `<g>` layer into one layer per
child; Merge combines selected layers of one group into a single `<g>` layer,
baking their transforms. Both are undoable.

## Lint and fixes

Each issue has a code, a short message, an optional help text, and zero or more
fixes. Nothing is applied automatically.

| code | detects | fixes |
|---|---|---|
| filter | `filter` attribute or `<filter>` use | remove filters |
| mask | `mask`/`clip-path` use | remove masks and clips (warn: may reveal hidden geometry) |
| raster | `<image>` | remove images |
| text | `<text>` | none; help explains outlining in the source tool |
| invisible-rect | full-canvas rect with `fill="none"`/opacity 0 | remove |
| background | bottom-most shape whose bbox covers >= 90% of the viewBox and is near-square: `<rect>`, a rounded-rect path, or a circle | remove; convert to document fill (solid, or linear gradient if the shape had one) |
| groups | more than 4 groups | none (warning) |
| empty | a layer with no renderable content | delete layer |

The background fix that converts to fill reads the shape's fill and gradient into
a `Fill` and sets `fill.default`.

## Editor

Three-pane layout, desktop first, works down to ~1024px wide.

Top bar: project name (editable, becomes the bundle name), undo, redo, import,
export, help.

Layers panel (left): groups as collapsible sections. Layers listed top-most first.
Drag to reorder within and across groups (pointer and keyboard sensors). Per row:
visibility eye, glass toggle, name (double-click to rename). Context menu: split,
merge, duplicate, delete, move to new group, ungroup. Group header: name, glass
summary, menu (rename, delete group, keep layers).

Canvas (center): the renderer output at fit-to-view zoom, wheel/pinch zoom.
Selection by click; drag to move; corner handles scale uniformly (Shift for free
scale); a rotate handle above the box; Alt-drag duplicates nothing (kept simple).
Arrow keys nudge 1pt, Shift+arrows 10pt. Snap to canvas center and to the
platform safe area when within 4pt. Toolbar above canvas: rendition tabs
(Default, Dark, Clear Light, Clear Dark, Tinted Light, Tinted Dark), tint color
(visible in Tinted), platform shape (iOS, macOS, watchOS), wallpaper (light,
dark, Apple-like gradients, checker), light angle dial. Corner label
"Approximate preview" with a help bubble explaining what differs from Apple's
renderer.

Inspector (right): appearance switch (Default, Dark, Mono) that scopes the
per-appearance fields. Selected layer: name, position, scale, rotation, flip,
opacity, blend mode, glass; per-appearance fill override (inherit, solid, gray),
opacity, hidden, blend mode. Selected group: lighting, specular, specular
placement (marks doc as IC2), blur material, refractivity (enable marks doc as
IC2), translucency, shadow. Nothing selected: document fill (Default and Dark),
watchOS toggle, compatibility note (Xcode 26 vs 27 when IC2 features are used).

Issues: badge in top bar with count; opens a list with per-issue fix buttons and
"apply to all layers" where applicable.

Keyboard: Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z and Ctrl+Y redo, Delete removes
selection, Cmd/Ctrl+D duplicate, Cmd/Ctrl+G new group from selection, Esc
deselect.

## State and history

zustand store holds `{ doc, selection, view }`. zundo tracks `doc` only.
Drag gestures pause history at pointer down and resume at pointer up so one
gesture is one undo step. Slider edits coalesce with a 300ms debounce. Autosave
writes `doc` to IndexedDB (idb-keyval) 500ms after change; on load, an existing
autosave is restored with a toast offering "Start over".

## Rendering

`core/render/raster.ts`: builds a standalone 1024x1024 SVG string for a layer and
appearance (applying fill override by wrapping the fragment as a mask over a
filled rect), loads it via blob URL into `Image`, draws to an OffscreenCanvas at
the requested pixel size (2x device pixel ratio, capped at 2048). Results cached
by hash of (svg, defs, transform, appearance override, size).

`core/render/shapes.ts`: platform masks. iOS: squircle (superellipse n≈5,
corner ≈ 22.37% of side). macOS: same shape scaled to 824/1024 centered.
watchOS: circle. Returns an SDF texture or a path for Canvas 2D.

`core/render/gl/`: WebGL2 renderer. Per frame:
1. Background: fill (none/solid/auto gradient/linear gradient) inside the platform
   mask over the wallpaper. Auto gradient approximates Apple's as base color at the
   bottom to a lighter, slightly desaturated tint at the top.
2. For each group bottom to top: composite its layers (opacity, blend mode) into a
   group texture. Compute blurred alpha (separable Gaussian, radius driven by
   blur material), derive a normal field from its gradient. Effects: shadow (blurred
   alpha offset down-right, black for neutral, group mean color for layer-color,
   scaled by shadow opacity), translucency (mix group color with blurred backdrop),
   refraction (offset backdrop sample by normal * strength * depth), specular rim
   (Fresnel-style term from normal · light direction, gated by `specular`,
   placement shifts the rim inside or outside the edge). `lighting: combined`
   computes the normal field from the union alpha; `individual` per layer.
   Layers with `glass: false` bypass effects and composite flat.
3. Rendition mapping: Default and Dark use their fills and overrides. Clear Light /
   Clear Dark: no fill; a glass plate with a faint rim over the wallpaper; layers
   drawn from Mono luminance as light glass (Clear Dark brighter). Tinted Light /
   Tinted Dark: light or dark plate; layers as Mono luminance multiplied by the tint
   color.
4. Final mask by platform shape, drawn onto the visible canvas.

Fallback when WebGL2 is unavailable: Canvas 2D flat composite with a drop shadow
and the label "Flat preview (WebGL unavailable)".

Renderer is framework-free with `render(doc, options): void` and
`toBlob(doc, options, size): Promise<Blob>`.

## Export

`core/export/iconjson.ts` maps `IconDoc` to `icon.json`:

- `supported-platforms`: `{ "squares": "shared" }` plus `"circles": ["watchOS"]` when enabled.
- `fill` or `fill-specializations` (base entry plus `appearance: "dark"` entry when a dark fill exists).
- Groups in icon.json order. Each group writes `layers`, `name`, `lighting`,
  `specular`, `blur-material` and legacy `blur` (same value), `translucency`,
  `shadow`, and `opacity`, `blend-mode`, `hidden` when non-default.
  `refractivity` and `specular-highlight-placement` only when set; then the
  document declares `features`.
- Layers write `name`, `image-name`, `glass`, and `opacity`, `blend-mode`,
  `hidden` when non-default. Overrides become `*-specializations` arrays with a
  base entry plus `dark`/`tinted` entries. Identity `position` is never written.
- Colors serialize as `extended-srgb:r,g,b,a` (5 decimals), gray as `extended-gray:w,a`.
- Asset names: sanitized layer name, deduplicated, with `.svg` or `.png`.
- Output is JSON with sorted keys and 2-space indent, matching Icon Composer.

`core/export/bundle.ts` builds `<Name>.icon/icon.json` and `Assets/*` and zips
with fflate (store, no compression needed). Layer SVG assets are
`<svg xmlns viewBox="0 0 1024 1024" width="1024" height="1024">` with the baked
transform; PNG assets are rasterized at 1024.

Export dialog options: asset format (SVG default, PNG), flat PNG (no glass or
approximate glass), combined SVG (with or without background rect). Downloads use
`showSaveFilePicker` when available, else an anchor with a blob URL.

## Testing

Vitest with happy-dom. Unit tests for every `core/svg` and `core/export` module
and for `core/model` operations, written before implementation. Fixture SVGs from
common exporters (Figma, Illustrator, Inkscape, Affinity) live in
`src/core/svg/__fixtures__`. `icon.json` output is validated with ajv against the
community schema copied to `src/core/export/__fixtures__/icon-schema.json`, and
asset references are cross-checked. `getBBox` is not available in happy-dom, so
bbox has an injectable measurer with a pure fallback for basic shapes used in tests.
Renderer pure parts (shapes, gradient math, luminance mapping, rendition mapping)
are unit tested; WebGL output is checked visually.

## Open risks

- Icon Composer may size SVG assets by `width`/`height` in points; the export
  writes both at 1024 to be safe.
- The specular bug on SVG layers is Apple's; the PNG option is the workaround.
- Glass approximation will differ from Apple's renderer, especially refraction and
  the iOS 27 generation. The preview label sets expectations.
