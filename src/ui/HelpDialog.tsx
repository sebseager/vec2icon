/** What this app does, what its preview cannot promise, and how to drive it. */
import { Fragment } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
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

/** "Shift + Cmd/Ctrl + Z, Ctrl + Y" → one group per alternative, one chip per key. */
const Keys = ({ keys }: { keys: string }) => (
  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
    {keys.split(', ').map((combo, i) => (
      <Fragment key={combo}>
        {i > 0 ? <span className="text-muted-foreground">or</span> : null}
        <KbdGroup>
          {combo.split(' + ').map((key, j) => (
            <Fragment key={key}>
              {j > 0 ? <span className="text-muted-foreground">+</span> : null}
              <Kbd>{key}</Kbd>
            </Fragment>
          ))}
        </KbdGroup>
      </Fragment>
    ))}
  </span>
)

const Topic = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-t py-3 first:border-t-0 first:pt-0">
    <h3 className="mb-1 font-medium text-[13px] text-foreground">{title}</h3>
    <div className="max-w-[62ch] space-y-2 text-muted-foreground leading-relaxed">{children}</div>
  </section>
)

export const HelpDialog = () => {
  const open = useEditor((s) => s.view.helpOpen)
  const setView = useEditor((s) => s.setView)

  return (
    <Dialog open={open} onOpenChange={(next) => setView({ helpOpen: next })}>
      <DialogContent className="max-h-[80vh] w-[42rem] max-w-[calc(100vw-2rem)] gap-0 overflow-y-auto text-xs sm:max-w-[42rem]">
        <DialogTitle className="mb-3 text-[15px]">About vec2icon</DialogTitle>

        <Topic title="Overview">
          <p>
            vec2icon turns SVG artwork into an Apple Icon Composer bundle. Each imported shape
            becomes a layer, layers sit in groups that share one glass material, and the document
            carries the background fill. Export writes a <code>.icon</code> folder you open in Icon
            Composer or drop into Xcode.
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
            Both lists read top-most first, matching what you see on the canvas. A group is the unit
            of glass: lighting, blur, translucency and shadow are set per group, so split artwork
            into groups by how it should catch the light. Icon Composer reads at most four groups
            comfortably.
          </p>
        </Topic>

        <Topic title="Appearances">
          <p>
            Default is the base artwork. Dark and Mono hold per-layer overrides on top of it — fill,
            opacity, blend mode and visibility. The six renditions come from those three: Default
            and Dark render directly, Clear and Tinted read the Mono values.
          </p>
        </Topic>

        <Topic title="AI Compose">
          <p>
            Describe an icon and Claude Opus draws it as layered SVG, which is then imported like a
            dropped file. It needs your own Anthropic API key, kept only in this browser and sent
            only to api.anthropic.com; each run is billed to your account, usually a few cents. The
            dialog shows the most a run can cost before you start. When the drawing fails the import
            checks it can be handed back to the model to fix a bounded number of times, or imported
            as is so you can fix it by hand.
          </p>
        </Topic>

        <Topic title="Export">
          <p>
            Xcode 26 reads the base format. Specular placement and refractivity are Icon Composer 2
            features, so a document that uses them requires Xcode 27. Icon Composer's SVG path
            mishandles specular highlights on some artwork; export layers as PNG if a highlight
            looks wrong.
          </p>
        </Topic>

        <Topic title="Shortcuts">
          <table className="w-full border-collapse">
            <tbody>
              {SHORTCUTS.map(([keys, description]) => (
                <tr key={keys} className="border-b last:border-b-0">
                  <th className="w-64 py-1.5 pr-4 text-left font-normal text-foreground">
                    <Keys keys={keys} />
                  </th>
                  <td className="py-1.5 text-muted-foreground">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Topic>
      </DialogContent>
    </Dialog>
  )
}
