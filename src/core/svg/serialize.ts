const SVG_NS_DECLARATION = / xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g

/**
 * Serialize an element as a fragment. The default SVG namespace declaration that
 * XMLSerializer re-adds on every fragment is dropped: fragments are always
 * re-embedded inside an `<svg xmlns="...">`, so it is noise.
 */
export const serializeElement = (el: Element): string =>
  new XMLSerializer().serializeToString(el).replace(SVG_NS_DECLARATION, '')
