import { serializeElement } from './serialize'

const XLINK_NS = 'http://www.w3.org/1999/xlink'
const URL_REFERENCE = /url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g

const addReferences = (el: Element, into: Set<string>): void => {
  for (const attr of Array.from(el.attributes)) {
    for (const match of attr.value.matchAll(URL_REFERENCE)) {
      if (match[1]) into.add(match[1])
    }
  }
  const href = el.getAttributeNS(null, 'href') ?? el.getAttributeNS(XLINK_NS, 'href')
  if (href?.startsWith('#')) into.add(href.slice(1))
}

/** Ids this element or any descendant references via `url(#id)` or `href="#id"`. */
export const referencedIds = (el: Element): Set<string> => {
  const ids = new Set<string>()
  addReferences(el, ids)
  for (const child of Array.from(el.querySelectorAll('*'))) addReferences(child, ids)
  return ids
}

/** Every element of `root` in document order, root excluded. */
const documentOrder = (root: Element): Element[] => Array.from(root.querySelectorAll('*'))

/**
 * The transitive closure of the definitions `fragment` needs, serialized as the
 * inner content of a `<defs>` (no wrapper), in document order and deduplicated.
 */
export const collectDefs = (root: SVGSVGElement, fragment: Element): string => {
  const all = documentOrder(root)
  const byId = new Map<string, Element>()
  for (const el of all) {
    const id = el.getAttribute('id')
    if (id && !byId.has(id)) byId.set(id, el)
  }

  const collected = new Set<Element>()
  let pending = Array.from(referencedIds(fragment))
  while (pending.length > 0) {
    const next: string[] = []
    for (const id of pending) {
      const el = byId.get(id)
      if (!el || collected.has(el) || el === fragment || fragment.contains(el)) continue
      collected.add(el)
      for (const reference of referencedIds(el)) next.push(reference)
    }
    pending = next
  }

  return all
    .filter((el) => collected.has(el))
    .map((el) => serializeElement(el))
    .join('')
}
