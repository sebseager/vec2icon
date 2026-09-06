/** Pull the SVG document out of a reply that may have ignored "SVG and nothing else". */

const FENCE = /```[a-z]*\n?([\s\S]*?)```/i

/** The first `<svg …>…</svg>` in `text`, or null when there is none. */
export const extractSvg = (text: string): string | null => {
  const fenced = FENCE.exec(text)?.[1]
  const source = fenced && /<svg[\s>]/i.test(fenced) ? fenced : text
  const start = source.search(/<svg[\s>]/i)
  if (start < 0) return null
  const end = source.lastIndexOf('</svg>')
  if (end < start) return null
  return source.slice(start, end + '</svg>'.length).trim()
}
