const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'

/** Namespace prefixes written by editors that carry no rendering meaning. */
const EDITOR_PREFIXES = ['inkscape', 'sodipodi', 'serif']

const walk = (el: Element, visit: (el: Element) => void): void => {
  visit(el)
  for (const child of Array.from(el.children)) walk(child, visit)
}

const hrefValue = (el: Element): string | null =>
  el.getAttributeNS(null, 'href') ?? el.getAttributeNS(XLINK_NS, 'href')

const isSafeHref = (value: string): boolean => {
  const trimmed = value.trim()
  return trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('data:')
}

const URL_REFERENCE = /url\(\s*(['"]?)([^)'"]*)\1\s*\)/g

/** The first `url(...)` target that points outside the document, if there is one. */
const externalUrl = (text: string): string | null => {
  for (const match of text.matchAll(URL_REFERENCE)) {
    const target = (match[2] ?? '').trim()
    if (target && !isSafeHref(target)) return target
  }
  return null
}

/**
 * Why the document must be refused, or null when it is safe to import.
 * Scripting, embedded HTML, event handlers and external references are all rejected.
 */
export const rejectionReason = (root: Element): string | null => {
  let reason: string | null = null
  walk(root, (el) => {
    if (reason) return
    const name = el.localName.toLowerCase()
    if (name === 'script') reason = 'Contains a <script> element'
    else if (name === 'foreignobject') reason = 'Contains a <foreignObject> element'
    if (reason) return
    for (const attr of Array.from(el.attributes)) {
      if (attr.localName.toLowerCase().startsWith('on')) {
        reason = `Contains an event handler attribute (${attr.name})`
        return
      }
    }
    for (const attr of Array.from(el.attributes)) {
      const external = externalUrl(attr.value)
      if (external) {
        reason = `Contains an external reference (${external.slice(0, 80)})`
        return
      }
    }
    if (name === 'style') {
      const css = el.textContent ?? ''
      const external = externalUrl(css)
      if (external) {
        reason = `Contains an external reference (${external.slice(0, 80)})`
        return
      }
      if (/@import/i.test(css)) {
        reason = 'Contains an @import in a <style> element'
        return
      }
    }
    const href = hrefValue(el)
    if (href !== null && href.trim() !== '' && !isSafeHref(href)) {
      reason = `Contains an external reference (${href.trim().slice(0, 80)})`
    }
  })
  return reason
}

const isRemovableAttribute = (attr: Attr): boolean => {
  const name = attr.name
  if (name === 'class') return true
  const prefix = name.includes(':') ? name.slice(0, name.indexOf(':')) : ''
  if (EDITOR_PREFIXES.includes(prefix)) return true
  // xmlns / xmlns:* declarations: keep only the SVG namespace.
  if (name === 'xmlns' || prefix === 'xmlns') return attr.value !== SVG_NS
  return false
}

/**
 * Strip editor cruft in place: comments, editor-namespace attributes and
 * declarations, and `class` (style resolution has already run).
 */
export const sanitizeElement = (el: Element): void => {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 8 /* COMMENT_NODE */) node.parentNode?.removeChild(node)
  }
  for (const attr of Array.from(el.attributes)) {
    if (isRemovableAttribute(attr)) el.removeAttribute(attr.name)
  }
  for (const child of Array.from(el.children)) sanitizeElement(child)
}
