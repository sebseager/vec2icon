/** Document identity on the left, the actions that leave the editor on the right. */
import { Download, Redo2, Undo2, Upload } from 'lucide-react'
import { type KeyboardEvent, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useEditor } from '@/state'
import { AppMenu } from './AppMenu'
import { IssuesPanel } from './IssuesPanel'
import { IconButton } from './lib/IconButton'
import { importFiles } from './lib/importFiles'
import { openImportPicker, registerImportInput } from './lib/importPicker'

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
      <Button
        variant="ghost"
        size="sm"
        aria-label="Rename icon"
        title="Click to rename"
        className="text-[13px] font-normal"
        onClick={() => setDraft(name)}
      >
        {name}
      </Button>
    )
  }

  return (
    <Input
      autoFocus
      aria-label="Icon name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className="h-7 w-40 text-[13px] md:text-[13px]"
    />
  )
}

const Divider = () => <Separator orientation="vertical" className="mx-1 self-stretch" />

export const TopBar = () => {
  const { canUndo, canRedo } = useHistory()
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const setView = useEditor((s) => s.setView)

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-background px-3">
      <span className="select-none px-1 font-medium font-mono text-[12px] text-muted-foreground tracking-tight">
        vec2icon
      </span>
      <Divider />
      <DocName />

      <div className="flex-1" />

      <IconButton label="Undo" title="Undo — Cmd/Ctrl+Z" disabled={!canUndo} onClick={undo}>
        <Undo2 size={15} aria-hidden="true" />
      </IconButton>
      <IconButton label="Redo" title="Redo — Shift+Cmd/Ctrl+Z" disabled={!canRedo} onClick={redo}>
        <Redo2 size={15} aria-hidden="true" />
      </IconButton>

      <input
        ref={registerImportInput}
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
      <Button variant="outline" size="sm" onClick={openImportPicker}>
        <Upload data-icon="inline-start" aria-hidden="true" />
        Import
      </Button>
      <Button size="sm" onClick={() => setView({ exportOpen: true })}>
        <Download data-icon="inline-start" aria-hidden="true" />
        Export
      </Button>

      <IssuesPanel />
      <AppMenu />
    </header>
  )
}
