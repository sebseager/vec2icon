/** What this app does, what its preview cannot promise, and how to drive it. */
import { Dialog } from '@base-ui/react/dialog'
import { useEditor } from '@/state'

const SHORTCUTS: readonly [string, string][] = [
  ['Cmd/Ctrl + Z', 'Undo'],
  ['Shift + Cmd/Ctrl + Z, Ctrl + Y', 'Redo'],
  ['Cmd/Ctrl + D', 'Duplicate selection'],
  ['Cmd/Ctrl + G', 'New group from selection'],
  ['Delete, Backspace', 'Remove selection'],
  ['Arrow keys', 'Nudge 1 pt'],
  ['Shift + arrow keys', 'Nudge 10 pt'],
  ['Esc', 'Deselect'],
]

const Topic = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-zinc-200 border-t py-3 first:border-t-0 first:pt-0">
    <h3 className="mb-1 font-medium text-[13px] text-zinc-900">{title}</h3>
    <div className="max-w-[62ch] space-y-2 text-zinc-600 leading-relaxed">{children}</div>
  </section>
)

export const HelpDialog = () => {
  const open = useEditor((s) => s.view.helpOpen)
  const setView = useEditor((s) => s.setView)

  return (
    <Dialog.Root open={open} onOpenChange={(next) => setView({ helpOpen: next })}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-zinc-900/25" />
        <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 max-h-[80vh] w-[42rem] overflow-y-auto border border-zinc-300 bg-white p-5 text-[12px] shadow-2xl shadow-black/15">
          <Dialog.Title className="mb-3 font-medium text-[15px] text-zinc-900">
            About vec2icon
          </Dialog.Title>

          <Topic title="Overview">
            <p>
              vec2icon turns SVG artwork into an Apple Icon Composer bundle. Each imported shape
              becomes a layer, layers sit in groups that share one glass material, and the document
              carries the background fill. Export writes a <code>.icon</code> folder you open in
              Icon Composer or drop into Xcode.
            </p>
          </Topic>

          <Topic title="Approximate preview">
            <p>
              The canvas approximates Apple's renderer. Refraction through the glass, the specular
              highlight and the way iOS 27 generates the Clear and Tinted renditions are all
              simplified here, so treat the preview as a guide to composition rather than a
              pixel-accurate proof. Check the real thing in Icon Composer before shipping.
            </p>
          </Topic>

          <Topic title="Layers and groups">
            <p>
              Both lists read top-most first, matching what you see on the canvas. A group is the
              unit of glass: lighting, blur, translucency and shadow are set per group, so split
              artwork into groups by how it should catch the light. Icon Composer reads at most four
              groups comfortably.
            </p>
          </Topic>

          <Topic title="Appearances">
            <p>
              Default is the base artwork. Dark and Mono hold per-layer overrides on top of it —
              fill, opacity, blend mode and visibility. The six renditions come from those three:
              Default and Dark render directly, Clear and Tinted read the Mono values.
            </p>
          </Topic>

          <Topic title="Export">
            <p>
              Xcode 26 reads the base format. Specular placement and refractivity are Icon Composer
              2 features, so a document that uses them requires Xcode 27. Icon Composer's SVG path
              mishandles specular highlights on some artwork; export layers as PNG if a highlight
              looks wrong.
            </p>
          </Topic>

          <Topic title="Shortcuts">
            <table className="w-full border-collapse">
              <tbody>
                {SHORTCUTS.map(([keys, description]) => (
                  <tr key={keys} className="border-zinc-200 border-b last:border-b-0">
                    <th className="w-64 py-1 pr-4 text-left font-normal text-zinc-700">{keys}</th>
                    <td className="py-1 text-zinc-600">{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Topic>

          <div className="mt-4 flex justify-end">
            <Dialog.Close className="h-7 rounded-[3px] border border-zinc-300 px-3 text-zinc-800 hover:bg-zinc-100">
              Close
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
