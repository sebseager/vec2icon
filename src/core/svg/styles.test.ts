import { describe, expect, it } from 'vitest'
import { fixture } from './__fixtures__'
import { parseSvg } from './parse'
import { PRESENTATION_PROPERTIES, parseStylesheet, resolveStyles, specificity } from './styles'

const rootOf = (text: string): SVGSVGElement => {
  const result = parseSvg(text)
  if (!result.ok) throw new Error(result.reason)
  return result.root
}

describe('specificity', () => {
  it('counts ids, classes/attributes/pseudo-classes and elements', () => {
    expect(specificity('#hero')).toEqual([1, 0, 0])
    expect(specificity('.cls-1')).toEqual([0, 1, 0])
    expect(specificity('rect')).toEqual([0, 0, 1])
    expect(specificity('g.a rect')).toEqual([0, 1, 2])
    expect(specificity('a[href]:hover')).toEqual([0, 2, 1])
    expect(specificity('li::before')).toEqual([0, 0, 2])
    expect(specificity('*')).toEqual([0, 0, 0])
  })
})

describe('parseStylesheet', () => {
  it('parses rules, strips comments and splits selector lists', () => {
    const rules = parseStylesheet('/* c */ .a, #b { fill: red; stroke: blue }')
    expect(rules).toEqual([
      {
        selector: '.a',
        declarations: { fill: 'red', stroke: 'blue' },
        specificity: [0, 1, 0],
        order: 0,
      },
      {
        selector: '#b',
        declarations: { fill: 'red', stroke: 'blue' },
        specificity: [1, 0, 0],
        order: 0,
      },
    ])
  })

  it('numbers rules in source order and ignores at-rules', () => {
    const rules = parseStylesheet('.a{fill:red}@media print{.a{fill:blue}}.b{fill:green}')
    expect(rules.map((r) => [r.selector, r.order, r.declarations.fill])).toEqual([
      ['.a', 0, 'red'],
      ['.b', 1, 'green'],
    ])
  })

  it('returns nothing for empty or junk input', () => {
    expect(parseStylesheet('')).toEqual([])
    expect(parseStylesheet('not css at all')).toEqual([])
  })
})

describe('resolveStyles', () => {
  it('resolves the Illustrator stylesheet onto presentation attributes', () => {
    const root = rootOf(fixture('illustrator.svg'))
    resolveStyles(root)

    const rect = root.querySelector('rect') as Element
    expect(rect.getAttribute('fill')).toBe('url(#linear-gradient)')
    expect(rect.getAttribute('stroke-width')).toBe('2px')

    const hero = root.querySelector('#hero') as Element
    expect(hero.getAttribute('fill')).toBe('#0f0') // inline style beats .cls-1
    expect(hero.getAttribute('fill-opacity')).toBe('.5') // #hero beats nothing else

    const circle = root.querySelector('circle') as Element
    expect(circle.getAttribute('fill')).toBe('#f00')
  })

  it('removes <style> elements and class/style attributes', () => {
    const root = rootOf(fixture('illustrator.svg'))
    resolveStyles(root)
    expect(root.querySelector('style')).toBeNull()
    const all = [root, ...root.querySelectorAll('*')]
    expect(all.filter((el) => el.hasAttribute('class'))).toEqual([])
    expect(all.filter((el) => el.hasAttribute('style'))).toEqual([])
  })

  it('lets an id rule beat a class rule regardless of source order', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>#a{fill:red}.c{fill:blue}</style><rect id="a" class="c"/></svg>',
    )
    resolveStyles(root)
    expect((root.querySelector('rect') as Element).getAttribute('fill')).toBe('red')
  })

  it('lets the later rule win at equal specificity', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.c{fill:red}.d{fill:blue}</style><rect class="c d"/></svg>',
    )
    resolveStyles(root)
    expect((root.querySelector('rect') as Element).getAttribute('fill')).toBe('blue')
  })

  it('lets css beat an existing presentation attribute', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.c{fill:red}</style><rect class="c" fill="green"/></svg>',
    )
    resolveStyles(root)
    expect((root.querySelector('rect') as Element).getAttribute('fill')).toBe('red')
  })

  it('writes only presentation properties', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.c{fill:red;font-family:Helvetica;--x:1}</style><text class="c">hi</text></svg>',
    )
    resolveStyles(root)
    const text = root.querySelector('text') as Element
    expect(text.getAttribute('fill')).toBe('red')
    expect(text.hasAttribute('font-family')).toBe(false)
    expect(text.hasAttribute('--x')).toBe(false)
    expect(PRESENTATION_PROPERTIES).toContain('fill')
    expect(PRESENTATION_PROPERTIES).not.toContain('font-family')
  })

  it('writes a css transform only when there is no transform attribute', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>.c{transform:translate(5px,0)}</style><rect class="c"/><g class="c" transform="scale(2)"/></svg>',
    )
    resolveStyles(root)
    expect((root.querySelector('rect') as Element).getAttribute('transform')).toBe(
      'translate(5px,0)',
    )
    expect((root.querySelector('g') as Element).getAttribute('transform')).toBe('scale(2)')
  })

  it('skips invalid selectors instead of throwing', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@@bad{fill:red}.c{fill:blue}</style><rect class="c"/></svg>',
    )
    expect(() => resolveStyles(root)).not.toThrow()
    expect((root.querySelector('rect') as Element).getAttribute('fill')).toBe('blue')
  })

  it('resolves inline styles even with no stylesheet', () => {
    const root = rootOf(fixture('inkscape.svg'))
    resolveStyles(root)
    const rect = root.querySelector('rect') as Element
    expect(rect.getAttribute('fill')).toBe('#2b8a3e')
    expect(rect.getAttribute('stroke')).toBe('none')
    expect(rect.hasAttribute('style')).toBe(false)
  })
})
