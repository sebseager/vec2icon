import { gunzipSync } from 'fflate'
import type { ViewBox } from '../model/types'

export type ParseResult =
  | { ok: true; doc: XMLDocument; root: SVGSVGElement }
  | { ok: false; reason: string }

const GZIP_MAGIC = [0x1f, 0x8b] as const

/** Inflate `.svgz` payloads (gzip magic `1f 8b`), then decode as UTF-8. */
export const decodeSvgBytes = (bytes: Uint8Array): string => {
  const gzipped = bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1]
  const raw = gzipped ? gunzipSync(bytes) : bytes
  return new TextDecoder('utf-8').decode(raw)
}

export const parseSvg = (text: string): ParseResult => {
  let doc: XMLDocument
  try {
    doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  } catch (error) {
    return { ok: false, reason: `XML parse error: ${(error as Error).message}` }
  }
  const error = doc.querySelector('parsererror')
  if (error) {
    const detail = (error.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
    return { ok: false, reason: detail ? `XML parse error: ${detail}` : 'XML parse error' }
  }
  const root = doc.documentElement
  if (root?.localName.toLowerCase() !== 'svg') {
    return { ok: false, reason: `Root element is <${root?.localName ?? 'nothing'}>, not <svg>` }
  }
  return { ok: true, doc, root: root as unknown as SVGSVGElement }
}

/** Parse a length such as "64px" / "12.5pt" / "100%"; percentages and junk give NaN. */
const readLength = (value: string | null): number => {
  if (!value) return Number.NaN
  const match = /^\s*([+-]?[\d.]+(?:e[+-]?\d+)?)\s*(px|pt|pc|mm|cm|in|em|ex)?\s*$/i.exec(value)
  return match?.[1] ? Number.parseFloat(match[1]) : Number.NaN
}

const DEFAULT_VIEW_BOX: ViewBox = [0, 0, 100, 100]

export const readViewBox = (root: SVGSVGElement): ViewBox => {
  const attr = root.getAttribute('viewBox')
  if (attr) {
    const parts = attr
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    const [x, y, w, h] = parts
    if (
      parts.length === 4 &&
      parts.every(Number.isFinite) &&
      x !== undefined &&
      y !== undefined &&
      w !== undefined &&
      h !== undefined &&
      w > 0 &&
      h > 0
    ) {
      return [x, y, w, h]
    }
  }
  const width = readLength(root.getAttribute('width'))
  const height = readLength(root.getAttribute('height'))
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return [0, 0, width, height]
  }
  return [...DEFAULT_VIEW_BOX]
}
