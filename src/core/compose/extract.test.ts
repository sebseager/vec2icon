import { describe, expect, it } from 'vitest'
import { extractSvg } from './extract'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g id="a"/></svg>'

describe('extractSvg', () => {
  it('returns a bare document untouched', () => {
    expect(extractSvg(`${SVG}\n`)).toBe(SVG)
  })

  it('strips prose around the document', () => {
    expect(extractSvg(`Here is your icon:\n${SVG}\nLet me know!`)).toBe(SVG)
  })

  it('unwraps a fenced code block', () => {
    expect(extractSvg(`\`\`\`svg\n${SVG}\n\`\`\``)).toBe(SVG)
    expect(extractSvg(`\`\`\`\n${SVG}\n\`\`\``)).toBe(SVG)
  })

  it('ignores a fence that holds no svg', () => {
    expect(extractSvg(`\`\`\`\nnot it\n\`\`\`\n${SVG}`)).toBe(SVG)
  })

  it('does not mistake <svgfoo> or an unclosed root for a document', () => {
    expect(extractSvg('<svgfoo></svgfoo>')).toBeNull()
    expect(extractSvg('<svg viewBox="0 0 1 1"><g/>')).toBeNull()
    expect(extractSvg('nothing here')).toBeNull()
  })
})
