/** The export sheet: what goes in the `.icon` package, plus optional extras. */
import { Checkbox } from '@base-ui/react/checkbox'
import { Dialog } from '@base-ui/react/dialog'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { type ReactNode, useId, useState } from 'react'
import { useEditor } from '@/state'
import { renderOptionsFromView } from '@/ui/canvas/lib/renderOptions'
import { getActiveRenderer } from '@/ui/canvas/rendererRef'
import { type AssetFormat, defaultExportOptions, type FlatGlass, runExport } from './lib/runExport'

const controlClass =
  'flex size-4 shrink-0 items-center justify-center border border-zinc-300 bg-white text-white outline-none data-[checked]:border-[#0a84ff] data-[checked]:bg-[#0a84ff] data-[disabled]:opacity-40 focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40'

const CheckMark = () => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    aria-hidden="true"
  >
    <path d="m2.5 8.5 4 4 7-9" />
  </svg>
)

const Row = ({ children }: { children: ReactNode }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: Base UI renders the control as a button inside
  <label className="flex items-center gap-2 text-[13px] text-zinc-700 select-none has-[[data-disabled]]:text-zinc-400">
    {children}
  </label>
)

const buttonClass =
  'h-7 rounded border px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff]/40'

export const ExportDialog = () => {
  const view = useEditor((s) => s.view)
  const doc = useEditor((s) => s.doc)
  const setView = useEditor((s) => s.setView)
  const pushToast = useEditor((s) => s.pushToast)

  const [options, setOptions] = useState(defaultExportOptions)
  const [busy, setBusy] = useState(false)
  const formatId = useId()

  const empty = doc.groups.length === 0

  const close = () => setView({ exportOpen: false })

  const onExport = async () => {
    setBusy(true)
    try {
      // A failed export keeps the dialog open — the toast says what went wrong
      // and the chosen options are still there to retry with.
      const ok = await runExport({
        doc,
        options,
        renderOptions: renderOptionsFromView(view),
        getRenderer: getActiveRenderer,
        toast: (message) => pushToast({ message }),
      })
      if (ok) close()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={view.exportOpen} onOpenChange={(next) => setView({ exportOpen: next })}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-zinc-950/25" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 w-[25rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow-2xl shadow-black/20 outline-none">
          <header className="border-b border-zinc-100 px-4 py-3">
            <Dialog.Title className="text-[13px] font-semibold text-zinc-900">
              Export icon
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-[12px] text-zinc-500">
              Saves an .icon package you can open in Icon Composer or drop into Xcode.
            </Dialog.Description>
          </header>

          <div className="flex flex-col gap-4 px-4 py-4">
            <section className="flex flex-col gap-2">
              <h3 id={formatId} className="text-[12px] font-medium text-zinc-900">
                Layer assets
              </h3>
              <RadioGroup
                aria-labelledby={formatId}
                value={options.assetFormat}
                onValueChange={(value) =>
                  setOptions((o) => ({ ...o, assetFormat: value as AssetFormat }))
                }
                className="flex gap-5"
              >
                {(['svg', 'png'] as AssetFormat[]).map((format) => (
                  <Row key={format}>
                    <Radio.Root value={format} className={`${controlClass} rounded-full`}>
                      <Radio.Indicator className="size-1.5 rounded-full bg-white data-[unchecked]:hidden" />
                    </Radio.Root>
                    {format.toUpperCase()}
                  </Row>
                ))}
              </RadioGroup>
              <p className="text-[12px] leading-relaxed text-zinc-500">
                PNG avoids Icon Composer&rsquo;s specular bug on SVG layers.
              </p>
            </section>

            <section className="flex flex-col gap-2 border-t border-zinc-100 pt-4">
              <Row>
                <Checkbox.Root
                  checked={options.flatPng}
                  onCheckedChange={(checked) => setOptions((o) => ({ ...o, flatPng: checked }))}
                  className={`${controlClass} rounded-[3px]`}
                >
                  <Checkbox.Indicator className="flex data-[unchecked]:hidden">
                    <CheckMark />
                  </Checkbox.Indicator>
                </Checkbox.Root>
                Also save flat PNG
              </Row>
              <RadioGroup
                aria-label="Flat PNG glass"
                disabled={!options.flatPng}
                value={options.flatGlass}
                onValueChange={(value) =>
                  setOptions((o) => ({ ...o, flatGlass: value as FlatGlass }))
                }
                className="ml-6 flex gap-5"
              >
                <Row>
                  <Radio.Root value="none" className={`${controlClass} rounded-full`}>
                    <Radio.Indicator className="size-1.5 rounded-full bg-white data-[unchecked]:hidden" />
                  </Radio.Root>
                  No glass
                </Row>
                <Row>
                  <Radio.Root value="approximate" className={`${controlClass} rounded-full`}>
                    <Radio.Indicator className="size-1.5 rounded-full bg-white data-[unchecked]:hidden" />
                  </Radio.Root>
                  Approximate glass
                </Row>
              </RadioGroup>
            </section>

            <section className="flex flex-col gap-2 border-t border-zinc-100 pt-4">
              <Row>
                <Checkbox.Root
                  checked={options.combinedSvg}
                  onCheckedChange={(checked) => setOptions((o) => ({ ...o, combinedSvg: checked }))}
                  className={`${controlClass} rounded-[3px]`}
                >
                  <Checkbox.Indicator className="flex data-[unchecked]:hidden">
                    <CheckMark />
                  </Checkbox.Indicator>
                </Checkbox.Root>
                Also save combined SVG
              </Row>
              <div className="ml-6">
                <Row>
                  <Checkbox.Root
                    checked={options.combinedBackground}
                    disabled={!options.combinedSvg}
                    onCheckedChange={(checked) =>
                      setOptions((o) => ({ ...o, combinedBackground: checked }))
                    }
                    className={`${controlClass} rounded-[3px]`}
                  >
                    <Checkbox.Indicator className="flex data-[unchecked]:hidden">
                      <CheckMark />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                  Include background
                </Row>
              </div>
            </section>
          </div>

          <footer className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3">
            <Dialog.Close
              className={`${buttonClass} border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50`}
            >
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={empty || busy}
              onClick={onExport}
              className={`${buttonClass} border-[#0a84ff] bg-[#0a84ff] font-medium text-white hover:bg-[#0b76e0] disabled:border-zinc-200 disabled:bg-zinc-200 disabled:text-zinc-400`}
            >
              Export
            </button>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
