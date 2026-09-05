/** Three panes under a top bar, with the whole window as a drop target. */
import { useEffect, useState } from 'react'
import { useEditor } from '@/state'
import { CanvasPane } from './canvas/CanvasPane'
import { ExportDialog } from './export/ExportDialog'
import { HelpDialog } from './HelpDialog'
import { Inspector } from './inspector/Inspector'
import { LayersPanel } from './layers/LayersPanel'
import { importFiles } from './lib/importFiles'
import { Toasts } from './Toasts'
import { TopBar } from './TopBar'

const carriesFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files')

/** Tracks drag enter/leave depth so crossing child elements does not flicker the overlay. */
const useFileDrop = (): boolean => {
  const [over, setOver] = useState(false)

  useEffect(() => {
    let depth = 0

    const onDragEnter = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      depth += 1
      setOver(true)
    }
    const onDragOver = (e: DragEvent): void => {
      if (carriesFiles(e)) e.preventDefault()
    }
    const onDragLeave = (): void => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const onDrop = (e: DragEvent): void => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      depth = 0
      setOver(false)
      void importFiles(Array.from(e.dataTransfer?.files ?? []), useEditor.getState())
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return over
}

export default function App() {
  const draggingFiles = useFileDrop()

  return (
    <div className="flex h-full min-w-[1024px] flex-col bg-zinc-100 text-[12px]">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <LayersPanel />
        <main aria-label="Canvas" className="flex min-w-0 flex-1">
          <CanvasPane />
        </main>
        <Inspector />
      </div>

      <Toasts />
      <HelpDialog />
      <ExportDialog />

      {draggingFiles ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-white/80">
          <p className="border border-accent border-dashed px-6 py-4 text-[14px] text-accent">
            Drop SVG files
          </p>
        </div>
      ) : null}
    </div>
  )
}
