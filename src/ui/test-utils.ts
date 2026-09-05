/** Test-only helpers. Not imported by app code. */
import { emptyDoc } from '@/core/model/defaults'
import { useEditor } from '@/state'

/** Puts the singleton store back to a freshly-loaded state, history included. */
export const resetEditor = (): void => {
  useEditor.setState({
    doc: emptyDoc(),
    selection: { layerIds: [], groupId: null },
    toasts: [],
  })
  useEditor.temporal.getState().clear()
}
