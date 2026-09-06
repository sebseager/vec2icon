import { describe, expect, it } from 'vitest'
import { createLayer } from '../model/defaults'
import { adjustTask, layerDocument, validateAdjusted } from './adjust'
import { ADJUST_SYSTEM_PROMPT } from './prompt'

const layer = () =>
  createLayer({
    name: 'Sun & Cloud',
    svg: '<g id="sun"><circle cx="50" cy="50" r="20" fill="url(#warm)"/></g>',
    defs: '<linearGradient id="warm"><stop offset="0" stop-color="#f90"/><stop offset="1" stop-color="#fc0"/></linearGradient>',
    sourceViewBox: [0, 0, 100, 100],
    bbox: { x: 30, y: 30, width: 40, height: 40 },
  })

describe('layerDocument', () => {
  it('wraps the fragment and its defs in a document with the source viewBox and an escaped title', () => {
    const doc = layerDocument(layer())
    expect(doc).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Sun &amp; Cloud</title><defs><linearGradient id="warm"><stop offset="0" stop-color="#f90"/><stop offset="1" stop-color="#fc0"/></linearGradient></defs><g id="sun"><circle cx="50" cy="50" r="20" fill="url(#warm)"/></g></svg>',
    )
  })

  it('leaves out an empty defs', () => {
    expect(layerDocument({ ...layer(), defs: '' })).not.toContain('<defs>')
  })
})

describe('validateAdjusted', () => {
  it('accepts an edit, keeping the defs it still uses and measuring the new bounds', async () => {
    const edited = layerDocument(layer()).replace('r="20"', 'r="40"')
    const result = await validateAdjusted(edited, layer())
    expect(result.problems).toEqual([])
    expect(result.parsed?.bbox).toEqual({ x: 10, y: 10, width: 80, height: 80 })
    expect(result.parsed?.svg).toContain('r="40"')
    expect(result.parsed?.defs).toContain('id="warm"')
  })

  it('insists on the original viewBox', async () => {
    const edited = layerDocument(layer()).replace(
      'viewBox="0 0 100 100"',
      'viewBox="0 0 1024 1024"',
    )
    const result = await validateAdjusted(edited, layer())
    expect(result.problems).toEqual(['The viewBox must stay "0 0 100 100".'])
    expect(result.parsed).not.toBeNull()
  })

  it('reports malformed and unsafe documents with nothing to apply', async () => {
    expect((await validateAdjusted('<svg><g></svg>', layer())).parsed).toBeNull()
    const unsafe = layerDocument(layer()).replace('<circle', '<circle onclick="x()"')
    const result = await validateAdjusted(unsafe, layer())
    expect(result.parsed).toBeNull()
    expect(result.problems[0]).toMatch(/event handler/)
  })

  it('reports lint issues on the edited artwork', async () => {
    const edited = layerDocument(layer()).replace('</g>', '<text x="1" y="1">hi</text></g>')
    const result = await validateAdjusted(edited, layer())
    expect(result.problems).toEqual([
      'Contains live text. Live text needs the font to be installed. Convert the text to outlines in your design tool and import again.',
    ])
    expect(result.parsed).not.toBeNull()
  })

  it('refuses a document that draws nothing', async () => {
    const result = await validateAdjusted(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>x</title></svg>',
      layer(),
    )
    expect(result.problems).toEqual(['The document draws nothing.'])
    expect(result.parsed).toBeNull()
  })
})

describe('adjustTask', () => {
  it('sends the instruction with the layer document, and the rejected edit on a fix turn', () => {
    const task = adjustTask('make it bigger', layer())
    expect(task.system).toBe(ADJUST_SYSTEM_PROMPT)
    expect(task.first).toBe(`Instruction:\nmake it bigger\n\nLayer:\n${layerDocument(layer())}`)
    const fix = task.fix('<svg/>', ['bad'])
    expect(fix).toContain('Instruction:\nmake it bigger')
    expect(fix).toContain('<svg/>')
    expect(fix).toContain('- bad')
  })
})
