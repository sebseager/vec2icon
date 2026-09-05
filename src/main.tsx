import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { emptyDoc } from '@/core/model/defaults'
import { clearAutosave, handleEditorKey, loadAutosave, startAutosave, useEditor } from '@/state'
import App from './ui/App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/** Restore what the last session left behind, but let it be thrown away in one click.
 * Reading IndexedDB is slow enough that a dropped file can land first — never
 * overwrite a document the user has already started. */
const restore = async (): Promise<void> => {
  const doc = await loadAutosave()
  if (!doc) return
  const state = useEditor.getState()
  if (state.doc.groups.length > 0) return
  state.setDoc(doc, { silent: true })
  state.pushToast({
    message: 'Restored autosave',
    action: {
      label: 'Start over',
      onClick: () => {
        useEditor.getState().setDoc(emptyDoc(), { silent: true })
        void clearAutosave()
      },
    },
  })
}

void restore()
  .catch(() =>
    useEditor.getState().pushToast({ message: 'Could not read the autosave in this browser.' }),
  )
  .finally(() => startAutosave(useEditor))

window.addEventListener('keydown', (e) => {
  if (handleEditorKey(e, useEditor.getState())) e.preventDefault()
})
