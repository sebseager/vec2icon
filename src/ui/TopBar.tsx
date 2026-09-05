/** Document identity on the left, the actions that leave the editor on the right. */
import { Download, HelpCircle, Redo2, Undo2, Upload } from 'lucide-react'
import { type KeyboardEvent, useRef, useState, useSyncExternalStore } from 'react'
import { useEditor } from '@/state'
import { IssuesPanel } from './IssuesPanel'
import { IconButton } from './lib/IconButton'
import { importFiles } from './lib/importFiles'

/** zundo keeps history in its own store, so subscribe to it rather than to `doc`. */
const useHistory = (): { canUndo: boolean; canRedo: boolean } => {
  const past = useSyncExternalStore(
    (listener) => useEditor.temporal.subscribe(listener),
    () => useEditor.temporal.getState().pastStates.length,
  )
  const future = useSyncExternalStore(
    (listener) => useEditor.temporal.subscribe(listener),
    () => useEditor.temporal.getState().futureStates.length,
  )
  return { canUndo: past > 0, canRedo: future > 0 }
}

const DocName = () => {
  const name = useEditor((s) => s.doc.name)
  const renameDoc = useEditor((s) => s.renameDoc)
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (): void => {
    const next = draft?.trim()
    if (next) renameDoc(next)
    setDraft(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') commit()
    else if (e.key === 'Escape') setDraft(null)
  }

  if (draft === null) {
    return (
      <button
        type="button"
        aria-label="Rename icon"
        title="Click to rename"
        className="h-7 rounded-[3px] px-1.5 text-[13px] text-zinc-900 hover:bg-zinc-100"
        onClick={() => setDraft(name)}
      >
        {name}
      </button>
    )
  }

  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: the field only exists once the name is clicked
      autoFocus
      aria-label="Icon name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="h-7 w-40 rounded-[3px] border border-accent bg-white px-1.5 text-[13px] text-zinc-900 outline-none"
    />
  )
}

export const TopBar = () => {
  const { canUndo, canRedo } = useHistory()
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const setView = useEditor((s) => s.setView)
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-zinc-200 border-b bg-white px-3">
      <span className="select-none text-[11px] text-zinc-400">vec2icon</span>
      <span className="h-4 w-px bg-zinc-200" />
      <DocName />

      <div className="flex-1" />

      <IconButton label="Undo" title="Undo — Cmd/Ctrl+Z" disabled={!canUndo} onClick={undo}>
        <Undo2 size={15} aria-hidden="true" />
      </IconButton>
      <IconButton label="Redo" title="Redo — Shift+Cmd/Ctrl+Z" disabled={!canRedo} onClick={redo}>
        <Redo2 size={15} aria-hidden="true" />
      </IconButton>

      <span className="h-4 w-px bg-zinc-200" />

      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".svg,.svgz"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          void importFiles(files, useEditor.getState())
        }}
      />
      <button
        type="button"
        className="flex h-7 items-center gap-1.5 rounded-[3px] border border-zinc-300 px-2 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-100"
        onClick={() => fileInput.current?.click()}
      >
        <Upload size={14} aria-hidden="true" />
        Import
      </button>
      <button
        type="button"
        className="flex h-7 items-center gap-1.5 rounded-[3px] border border-accent/50 px-2 text-accent hover:border-accent hover:bg-accent-weak"
        onClick={() => setView({ exportOpen: true })}
      >
        <Download size={14} aria-hidden="true" />
        Export
      </button>

      <IssuesPanel />

      <IconButton label="Help" onClick={() => setView({ helpOpen: true })}>
        <HelpCircle size={15} aria-hidden="true" />
      </IconButton>
    </header>
  )
}
