/** Turns an issue's fix button into the store calls that apply it. */
import type { IssueCode, Layer } from '@/core/model/types'
import { applyLayerFix, backgroundFill } from '@/core/svg'
import type { EditorState } from '@/state'

/** Codes that can show up on several layers at once and are safe to fix in bulk. */
export const FIX_ALL_CODES: readonly IssueCode[] = ['filter', 'mask', 'raster']

/** Applies one fix. `background`/`to-fill` also moves the shape's paint to the document fill. */
export const applyIssueFix = (
  state: EditorState,
  layer: Layer,
  code: IssueCode,
  fixId: string,
): void => {
  const fill =
    code === 'background' && fixId === 'to-fill' ? (backgroundFill(layer) ?? undefined) : undefined
  state.applyFix(layer.id, code, fixId, applyLayerFix(layer, code, fixId), fill)
}

/** Applies the same fix to every layer that reports `code`, as a single undo step. */
export const applyIssueFixToAll = (state: EditorState, code: IssueCode, fixId: string): void => {
  const targets = state.doc.groups
    .flatMap((group) => group.layers)
    .filter((layer) => layer.issues.some((issue) => issue.code === code))
  if (targets.length === 0) return

  state.beginGesture()
  try {
    for (const layer of targets) applyIssueFix(state, layer, code, fixId)
  } finally {
    state.endGesture()
  }
}
