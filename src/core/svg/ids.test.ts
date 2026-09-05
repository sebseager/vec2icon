import { describe, expect, it } from 'vitest'
import { prefixIds } from './ids'

describe('prefixIds', () => {
  it('rewrites declared ids and url(#…) references in both svg and defs', () => {
    const out = prefixIds(
      '<g fill="url(#grad)"><path clip-path="url(#clip)"/></g>',
      '<linearGradient id="grad"/><clipPath id="clip"/>',
      'l0-',
    )
    expect(out.defs).toBe('<linearGradient id="l0-grad"/><clipPath id="l0-clip"/>')
    expect(out.svg).toBe('<g fill="url(#l0-grad)"><path clip-path="url(#l0-clip)"/></g>')
  })

  it('rewrites href and xlink:href references', () => {
    const out = prefixIds('<use href="#a"/><use xlink:href="#a"/>', '<path id="a"/>', 'p-')
    expect(out.svg).toBe('<use href="#p-a"/><use xlink:href="#p-a"/>')
    expect(out.defs).toBe('<path id="p-a"/>')
  })

  it('handles quoted url() forms', () => {
    const out = prefixIds(
      `<g fill="url('#g')" stroke="url(&quot;#g&quot;)"/>`,
      '<linearGradient id="g"/>',
      'x-',
    )
    expect(out.svg).toContain(`url('#x-g')`)
    expect(out.svg).toContain(`url(&quot;#x-g&quot;)`)
  })

  it('does not rewrite references to ids that are not declared', () => {
    const out = prefixIds('<g fill="url(#missing)"><use href="#nope"/></g>', '', 'l1-')
    expect(out.svg).toBe('<g fill="url(#missing)"><use href="#nope"/></g>')
  })

  it('leaves markup without ids untouched', () => {
    const svg = '<g><path d="M0 0h1v1H0z"/></g>'
    expect(prefixIds(svg, '', 'l0-')).toEqual({ svg, defs: '' })
  })

  it('isolates two layers that declare the same id', () => {
    const a = prefixIds('<g fill="url(#g)"/>', '<linearGradient id="g"/>', 'l0-')
    const b = prefixIds('<g fill="url(#g)"/>', '<linearGradient id="g"/>', 'l1-')
    expect(a.svg).not.toBe(b.svg)
    expect(a.defs).not.toBe(b.defs)
  })
})
