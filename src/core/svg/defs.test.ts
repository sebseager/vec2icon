import { describe, expect, it } from 'vitest'
import { fixture } from './__fixtures__'
import { collectDefs, referencedIds } from './defs'
import { parseSvg } from './parse'

const rootOf = (text: string): SVGSVGElement => {
  const result = parseSvg(text)
  if (!result.ok) throw new Error(result.reason)
  return result.root
}

describe('referencedIds', () => {
  it('finds url(#id) in any attribute, on the element and its descendants', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip)"><rect fill="url(#grad)" filter="url( #blur )"/></g></svg>',
    )
    expect(referencedIds(root.querySelector('g') as Element)).toEqual(
      new Set(['clip', 'grad', 'blur']),
    )
  })

  it('finds href and xlink:href fragment references', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g><use href="#a"/><use xlink:href="#b"/><image href="data:image/png;base64,AA"/></g></svg>',
    )
    expect(referencedIds(root.querySelector('g') as Element)).toEqual(new Set(['a', 'b']))
  })

  it('returns an empty set when nothing is referenced', () => {
    const root = rootOf('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#f00"/></svg>')
    expect(referencedIds(root.querySelector('rect') as Element)).toEqual(new Set())
  })
})

describe('collectDefs', () => {
  it('collects the clipPath and gradient a Figma layer references', () => {
    const root = rootOf(fixture('figma.svg'))
    const defs = collectDefs(root, root.querySelector('g') as Element)
    expect(defs).toContain('<clipPath id="clip0_1_2">')
    expect(defs).toContain('<linearGradient id="paint0_linear_1_2"')
    expect(defs.indexOf('<clipPath')).toBeLessThan(defs.indexOf('<linearGradient'))
  })

  it('follows references transitively through href', () => {
    const root = rootOf(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">',
        '<defs>',
        '<linearGradient id="base"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>',
        '<linearGradient id="derived" xlink:href="#base" x1="0" y1="0" x2="1" y2="0"/>',
        '<linearGradient id="unused"><stop offset="0" stop-color="#f00"/></linearGradient>',
        '</defs>',
        '<rect fill="url(#derived)"/>',
        '</svg>',
      ].join(''),
    )
    const defs = collectDefs(root, root.querySelector('rect') as Element)
    expect(defs).toContain('id="base"')
    expect(defs).toContain('id="derived"')
    expect(defs).not.toContain('id="unused"')
    expect(defs.indexOf('id="base"')).toBeLessThan(defs.indexOf('id="derived"'))
  })

  it('finds referenced nodes outside <defs> too, and never repeats one', () => {
    const root = rootOf(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect id="tile" width="4" height="4"/><g><use href="#tile"/><use href="#tile"/></g></svg>',
    )
    const defs = collectDefs(root, root.querySelector('g') as Element)
    expect(defs.match(/id="tile"/g)).toHaveLength(1)
  })

  it('returns an empty string when nothing is referenced', () => {
    const root = rootOf(fixture('background-rect.svg'))
    expect(collectDefs(root, root.querySelector('path') as Element)).toBe('')
  })

  it('omits the redundant svg namespace declaration', () => {
    const root = rootOf(fixture('figma.svg'))
    const defs = collectDefs(root, root.querySelector('g') as Element)
    expect(defs).not.toContain('xmlns="http://www.w3.org/2000/svg"')
  })
})
