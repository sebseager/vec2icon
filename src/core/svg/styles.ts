export type StyleRule = {
  selector: string
  declarations: Record<string, string>
  specificity: [number, number, number]
  order: number
}

/** SVG presentation properties we carry across from CSS onto attributes. */
export const PRESENTATION_PROPERTIES: readonly string[] = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'clip-rule',
  'display',
  'visibility',
  'transform',
  'color',
  'stop-color',
  'stop-opacity',
]

const PRESENTATION_SET = new Set(PRESENTATION_PROPERTIES)

/** CSS specificity as [ids, classes + attributes + pseudo-classes, elements]. */
export const specificity = (selector: string): [number, number, number] => {
  let rest = selector
  let a = 0
  let b = 0
  let c = 0

  const consume = (re: RegExp, onMatch: () => void): void => {
    rest = rest.replace(re, () => {
      onMatch()
      return ' '
    })
  }

  consume(/\[[^\]]*\]/g, () => {
    b += 1
  })
  consume(/::[\w-]+/g, () => {
    c += 1
  })
  consume(/:[\w-]+(?:\([^)]*\))?/g, () => {
    b += 1
  })
  consume(/#[\w-]+/g, () => {
    a += 1
  })
  consume(/\.[\w-]+/g, () => {
    b += 1
  })
  for (const _ of rest.matchAll(/[a-zA-Z][\w-]*/g)) c += 1
  return [a, b, c]
}

/** Parse declarations such as "fill: red; stroke: blue". */
const parseDeclarations = (body: string): Record<string, string> => {
  const declarations: Record<string, string> = {}
  for (const part of body.split(';')) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const property = part.slice(0, colon).trim().toLowerCase()
    const value = part.slice(colon + 1).trim()
    if (property && value) declarations[property] = value
  }
  return declarations
}

/**
 * Deliberately small CSS parser: enough for exporter stylesheets, which are flat
 * lists of simple rules. At-rules (`@media`, `@font-face`, ...) are dropped whole.
 */
export const parseStylesheet = (css: string): StyleRule[] => {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const rules: StyleRule[] = []
  let order = 0
  for (const chunk of withoutComments.split('}')) {
    const brace = chunk.indexOf('{')
    if (brace < 0) continue
    const selectorList = chunk.slice(0, brace).trim()
    if (!selectorList || selectorList.startsWith('@')) continue
    const declarations = parseDeclarations(chunk.slice(brace + 1))
    if (Object.keys(declarations).length === 0) continue
    for (const selector of selectorList.split(',')) {
      const trimmed = selector.trim()
      if (!trimmed) continue
      rules.push({ selector: trimmed, declarations, specificity: specificity(trimmed), order })
    }
    order += 1
  }
  return rules
}

const compareRules = (x: StyleRule, y: StyleRule): number => {
  for (let i = 0; i < 3; i++) {
    const diff = (x.specificity[i] ?? 0) - (y.specificity[i] ?? 0)
    if (diff !== 0) return diff
  }
  return x.order - y.order
}

/**
 * Flatten `<style>` rules and inline `style=""` onto presentation attributes, then
 * drop every trace of CSS so later stages only ever look at attributes.
 */
export const resolveStyles = (root: SVGSVGElement): void => {
  const styleElements = Array.from(root.querySelectorAll('style'))
  const css = styleElements.map((el) => el.textContent ?? '').join('\n')
  const rules = parseStylesheet(css).sort(compareRules)

  const elements: Element[] = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const el of elements) {
    const resolved: Record<string, string> = {}
    for (const rule of rules) {
      let matched = false
      try {
        matched = el.matches(rule.selector)
      } catch {
        continue // invalid or unsupported selector
      }
      if (!matched) continue
      for (const [property, value] of Object.entries(rule.declarations)) resolved[property] = value
    }
    Object.assign(resolved, parseDeclarations(el.getAttribute('style') ?? ''))

    for (const [property, value] of Object.entries(resolved)) {
      if (!PRESENTATION_SET.has(property)) continue
      if (property === 'transform' && el.hasAttribute('transform')) continue
      el.setAttribute(property, value)
    }
  }

  for (const el of styleElements) el.parentNode?.removeChild(el)
  for (const el of elements) {
    el.removeAttribute('class')
    el.removeAttribute('style')
  }
}
