import { gzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { fixture } from './__fixtures__'
import { decodeSvgBytes, parseSvg, readViewBox } from './parse'

const rootOf = (text: string): SVGSVGElement => {
  const result = parseSvg(text)
  if (!result.ok) throw new Error(`expected parse to succeed: ${result.reason}`)
  return result.root
}

describe('decodeSvgBytes', () => {
  it('decodes plain utf-8 bytes', () => {
    const text = '<svg xmlns="http://www.w3.org/2000/svg"><title>é</title></svg>'
    expect(decodeSvgBytes(new TextEncoder().encode(text))).toBe(text)
  })

  it('gunzips bytes carrying the gzip magic number', () => {
    const text = fixture('figma.svg')
    const gz = gzipSync(new TextEncoder().encode(text))
    expect(gz[0]).toBe(0x1f)
    expect(gz[1]).toBe(0x8b)
    expect(decodeSvgBytes(gz)).toBe(text)
  })
})

describe('parseSvg', () => {
  it('parses a well-formed svg document', () => {
    const result = parseSvg(fixture('figma.svg'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.root.tagName).toBe('svg')
    expect(result.doc.documentElement).toBe(result.root)
  })

  it('rejects malformed xml with a reason', () => {
    const result = parseSvg('<svg><g></svg>')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/xml|parse/i)
  })

  it('rejects a document whose root is not <svg>', () => {
    const result = parseSvg('<html xmlns="http://www.w3.org/1999/xhtml"><body/></html>')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(/svg/i)
  })
})

describe('readViewBox', () => {
  it('reads the viewBox attribute', () => {
    expect(readViewBox(rootOf(fixture('illustrator.svg')))).toEqual([0, 0, 512, 512])
  })

  it('tolerates comma separators and leading whitespace', () => {
    expect(
      readViewBox(rootOf('<svg xmlns="http://www.w3.org/2000/svg" viewBox=" 1, 2, 3, 4 "/>')),
    ).toEqual([1, 2, 3, 4])
  })

  it('falls back to width/height with units stripped', () => {
    const root = rootOf('<svg xmlns="http://www.w3.org/2000/svg" width="64px" height="32pt"/>')
    expect(readViewBox(root)).toEqual([0, 0, 64, 32])
  })

  it('falls back to 0 0 100 100 when there is nothing usable', () => {
    expect(readViewBox(rootOf('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toEqual([
      0, 0, 100, 100,
    ])
    expect(
      readViewBox(rootOf('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"/>')),
    ).toEqual([0, 0, 100, 100])
  })

  it('ignores a viewBox that is not four numbers or has no area', () => {
    expect(
      readViewBox(rootOf('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10"/>')),
    ).toEqual([0, 0, 100, 100])
    expect(
      readViewBox(
        rootOf('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0" width="8" height="8"/>'),
      ),
    ).toEqual([0, 0, 8, 8])
  })
})
