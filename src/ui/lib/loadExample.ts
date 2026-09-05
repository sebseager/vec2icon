/** Replaces the document with the bundled example. */
import { loadExampleDoc } from '@/examples'
import type { EditorState } from '@/state'

export const loadExample = async (state: EditorState): Promise<void> => {
  try {
    state.setDoc(await loadExampleDoc())
    state.clearSelection()
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error'
    state.pushToast({ message: `Could not load the example: ${reason}` })
  }
}
