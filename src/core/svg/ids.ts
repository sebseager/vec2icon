/** Namespacing the ids inside a layer fragment, so several layers can share
 * one SVG document without their gradients, clip paths and filters colliding. */

/** `id="X"` / `id='X'` declarations. */
const ID_DECL_RE = /\bid\s*=\s*(["'])([^"']*)\1/g

/** `url(#X)`, `url('#X')`, `url("#X")` and `url(&quot;#X&quot;)`. */
const URL_REF_RE = /url\(\s*(&quot;|["'])?#([^"'()&\s]+)\1?\s*\)/g

/** `href="#X"` and `xlink:href="#X"`. */
const HREF_REF_RE = /\b((?:xlink:)?href)\s*=\s*(["'])#([^"']*)\2/g

const declaredIds = (...sources: string[]): Set<string> => {
  const ids = new Set<string>()
  for (const source of sources) {
    for (const match of source.matchAll(ID_DECL_RE)) {
      if (match[2]) ids.add(match[2])
    }
  }
  return ids
}

const rewrite = (source: string, ids: Set<string>, prefix: string): string =>
  source
    .replace(ID_DECL_RE, (whole, quote: string, id: string) =>
      ids.has(id) ? `id=${quote}${prefix}${id}${quote}` : whole,
    )
    .replace(URL_REF_RE, (whole, quote: string | undefined, id: string) =>
      ids.has(id) ? `url(${quote ?? ''}#${prefix}${id}${quote ?? ''})` : whole,
    )
    .replace(HREF_REF_RE, (whole, attr: string, quote: string, id: string) =>
      ids.has(id) ? `${attr}=${quote}#${prefix}${id}${quote}` : whole,
    )

/** Namespace every id declared in `svg` or `defs` (and every reference to one)
 * with `prefix`, so several layers can share one SVG document without their
 * gradients, clip paths and filters colliding. References to ids that are not
 * declared here are left alone — they may point at something external. */
export const prefixIds = (
  svg: string,
  defs: string,
  prefix: string,
): { svg: string; defs: string } => {
  const ids = declaredIds(svg, defs)
  if (ids.size === 0) return { svg, defs }
  return { svg: rewrite(svg, ids, prefix), defs: rewrite(defs, ids, prefix) }
}
