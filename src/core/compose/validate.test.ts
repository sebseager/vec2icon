import { describe, expect, it } from 'vitest'
import { validateComposed } from './validate'

const wrap = (body: string, viewBox = '0 0 1024 1024'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`

const GOOD = wrap(
  '<title>Sun Icon</title><g id="background"><rect x="0" y="0" width="1024" height="1024" fill="#4a90c4"/></g><g id="sun"><circle cx="512" cy="512" r="200" fill="#ffc53d"/></g>',
)

describe('validateComposed', () => {
  it('accepts a well-formed layered document and lifts the background into a fill', async () => {
    const result = await validateComposed(GOOD)
    expect(result.problems).toEqual([])
    expect(result.parsed?.name).toBe('Sun Icon')
    expect(result.parsed?.fill).toMatchObject({ kind: 'solid' })
    expect(result.parsed?.groups.flatMap((g) => g.layers.map((l) => l.name))).toEqual(['sun'])
  })

  it('leaves the layers alone when there is no background', async () => {
    const result = await validateComposed(
      wrap('<title>Dot</title><g id="a"><circle cx="512" cy="512" r="9" fill="#000"/></g>'),
    )
    expect(result.problems).toEqual([])
    expect(result.parsed?.fill).toBeNull()
    expect(result.parsed?.groups.flatMap((g) => g.layers.map((l) => l.name))).toEqual(['a'])
  })

  it('reports malformed XML with nothing to import', async () => {
    const result = await validateComposed('<svg viewBox="0 0 1024 1024"><g></svg>')
    expect(result.parsed).toBeNull()
    expect(result.problems[0]).toMatch(/Not well-formed/)
  })

  it('rejects a wrong viewBox and a missing title but still returns the import', async () => {
    const result = await validateComposed(
      wrap('<g id="a"><circle cx="5" cy="5" r="2" fill="#000"/></g>', '0 0 100 100'),
    )
    expect(result.problems).toEqual([
      'The viewBox must be "0 0 1024 1024".',
      'Missing a <title> naming the icon as the first child of <svg>.',
    ])
    expect(result.parsed?.name).toBe('Composed icon')
    expect(result.parsed?.groups).toHaveLength(1)
  })

  it('passes the importer refusal through', async () => {
    const result = await validateComposed(
      wrap('<title>Bad</title><g id="a"><circle r="1" onclick="x()"/></g>'),
    )
    expect(result.parsed).toBeNull()
    expect(result.problems.join(' ')).toMatch(/event handler/)
  })

  it('names the layer and the lint issue for forbidden content', async () => {
    const result = await validateComposed(
      wrap(
        '<title>Texty</title><g id="label"><text x="10" y="10">hi</text></g><g id="pic"><image href="data:image/png;base64,AAAA" width="10" height="10"/></g>',
      ),
    )
    expect(result.problems).toHaveLength(2)
    expect(result.problems[0]).toMatch(/^Layer "pic": Contains a raster image\./)
    expect(result.problems[1]).toMatch(/^Layer "label": Contains live text\./)
    expect(result.parsed).not.toBeNull()
  })

  it('lifts a two-stop linear gradient background into a gradient fill', async () => {
    const result = await validateComposed(
      wrap(
        '<title>Grad</title><defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><g id="background"><rect x="0" y="0" width="1024" height="1024" fill="url(#g)"/></g><g id="a"><circle cx="512" cy="512" r="9" fill="#000"/></g>',
      ),
    )
    expect(result.problems).toEqual([])
    expect(result.parsed?.fill).toMatchObject({ kind: 'linear-gradient' })
    expect(result.parsed?.groups.flatMap((g) => g.layers.map((l) => l.name))).toEqual(['a'])
  })

  it('refuses a background whose paint cannot become a document fill', async () => {
    const result = await validateComposed(
      wrap(
        '<title>Rad</title><defs><radialGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></radialGradient></defs><g id="background"><rect x="0" y="0" width="1024" height="1024" fill="url(#g)"/></g><g id="a"><circle cx="512" cy="512" r="9" fill="#000"/></g>',
      ),
    )
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toMatch(/cannot become the document fill/)
    expect(result.parsed?.fill).toBeNull()
    expect(result.parsed?.groups.flatMap((g) => g.layers.map((l) => l.name))).toEqual([
      'a',
      'background',
    ])
  })

  it('complains when only a background was drawn', async () => {
    const result = await validateComposed(
      wrap(
        '<title>Blank</title><g id="background"><rect x="0" y="0" width="1024" height="1024" fill="#abc"/></g>',
      ),
    )
    expect(result.problems).toEqual(['The document draws nothing besides a background.'])
    expect(result.parsed?.groups).toEqual([])
  })
})
