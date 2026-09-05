import { describe, expect, it } from 'vitest'
import { fixture } from './__fixtures__'
import { parseSvg } from './parse'
import { rejectionReason, sanitizeElement } from './sanitize'

const rootOf = (text: string): SVGSVGElement => {
  const result = parseSvg(text)
  if (!result.ok) throw new Error(result.reason)
  return result.root
}

const serialize = (el: Element): string => new XMLSerializer().serializeToString(el)

describe('rejectionReason', () => {
  it('accepts the clean exporter fixtures', () => {
    for (const name of ['figma.svg', 'illustrator.svg', 'inkscape.svg', 'affinity.svg']) {
      expect(rejectionReason(rootOf(fixture(name)))).toBeNull()
    }
  })

  it('rejects <script>', () => {
    expect(rejectionReason(rootOf(fixture('bad-script.svg')))).toMatch(/script/i)
  })

  it('rejects <foreignObject>', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="10" height="10"/></svg>',
    )
    expect(rejectionReason(root)).toMatch(/foreignObject/i)
  })

  it('rejects event handler attributes', () => {
    const root = rootOf('<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>')
    expect(rejectionReason(root)).toMatch(/onclick/i)
  })

  it('rejects external href references', () => {
    expect(rejectionReason(rootOf(fixture('bad-external.svg')))).toMatch(/external/i)
  })

  it('rejects external xlink:href references', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="other.svg#a"/></svg>',
    )
    expect(rejectionReason(root)).toMatch(/external/i)
  })

  it('rejects an external url() in any attribute value', () => {
    for (const value of [
      'url(https://evil.example/x.svg#g)',
      'url(http://evil.example/x.svg#g)',
      'url(//evil.example/x.svg#g)',
      "url('https://evil.example/x.svg#g')",
    ]) {
      const root = rootOf(`<svg xmlns="http://www.w3.org/2000/svg"><rect fill="${value}"/></svg>`)
      expect(rejectionReason(root)).toMatch(/external/i)
    }
  })

  it('rejects an external url() inside <style> text', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:url(http://evil.example/x)}</style><rect class="a"/></svg>',
    )
    expect(rejectionReason(root)).toMatch(/external/i)
  })

  it('rejects an @import in <style> text', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(//evil.example/x.css);</style></svg>',
    )
    expect(rejectionReason(root)).toMatch(/external|import/i)
  })

  it('allows internal and data url() references, in attributes and in <style>', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.a{fill:url(#grad)}</style><rect fill="url(#grad)" clip-path="url( #clip )"/><image href="data:image/png;base64,AA"/></svg>',
    )
    expect(rejectionReason(root)).toBeNull()
  })

  it('allows internal and data hrefs', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"/><image href="data:image/png;base64,AA"/></svg>',
    )
    expect(rejectionReason(root)).toBeNull()
  })
})

describe('sanitizeElement', () => {
  it('strips editor namespace attributes and declarations but keeps svg ones', () => {
    const root = rootOf(fixture('inkscape.svg'))
    sanitizeElement(root)
    const attributeNames = [...root.querySelectorAll('*'), root].flatMap((el) =>
      [...el.attributes].map((a) => a.name),
    )
    expect(attributeNames.filter((n) => /^(inkscape|sodipodi):/.test(n))).toEqual([])
    expect(attributeNames).not.toContain('xmlns:inkscape')
    expect(attributeNames).not.toContain('xmlns:sodipodi')
    const out = serialize(root)
    expect(out).toContain('http://www.w3.org/2000/svg')
    expect(out).toContain('viewBox="0 0 256 256"')
  })

  it('strips serif attributes', () => {
    const root = rootOf(fixture('affinity.svg'))
    sanitizeElement(root)
    expect(serialize(root)).not.toMatch(/serif:/)
  })

  it('removes comments anywhere in the subtree', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- top --><g><!-- inner --><rect/></g></svg>',
    )
    sanitizeElement(root)
    expect(serialize(root)).not.toContain('<!--')
    expect(serialize(root)).toContain('<rect')
  })

  it('removes class attributes but keeps presentation attributes', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="cls-1" fill="#f00" id="keep"/></svg>',
    )
    sanitizeElement(root)
    const out = serialize(root)
    expect(out).not.toContain('class=')
    expect(out).toContain('fill="#f00"')
    expect(out).toContain('id="keep"')
  })
})
