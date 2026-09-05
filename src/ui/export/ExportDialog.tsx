/** The export sheet: what goes in the `.icon` package, plus optional extras. */
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useEditor } from '@/state'
import { renderOptionsFromView } from '@/ui/canvas/lib/renderOptions'
import { getActiveRenderer } from '@/ui/canvas/rendererRef'
import { type AssetFormat, defaultExportOptions, type FlatGlass, runExport } from './lib/runExport'

const labelClass = 'text-xs font-normal has-[[data-disabled]]:text-muted-foreground'

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
    <Dialog open={view.exportOpen} onOpenChange={(next) => setView({ exportOpen: next })}>
      <DialogContent
        showCloseButton={false}
        className="w-[25rem] max-w-[calc(100vw-2rem)] gap-0 p-0 text-xs sm:max-w-[25rem]"
      >
        <DialogHeader className="gap-0.5 border-b px-4 py-3">
          <DialogTitle className="text-[13px]">Export icon</DialogTitle>
          <DialogDescription className="text-xs">
            Saves an .icon package you can open in Icon Composer or drop into Xcode.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <section className="flex flex-col gap-2">
            <h3 id={formatId} className="font-medium text-foreground">
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
                <Label key={format} className={labelClass}>
                  <RadioGroupItem value={format} />
                  {format.toUpperCase()}
                </Label>
              ))}
            </RadioGroup>
            <p className="leading-relaxed text-muted-foreground">
              PNG avoids Icon Composer&rsquo;s specular bug on SVG layers.
            </p>
          </section>

          <section className="flex flex-col gap-2 border-t pt-4">
            <Label className={labelClass}>
              <Checkbox
                checked={options.flatPng}
                onCheckedChange={(checked) => setOptions((o) => ({ ...o, flatPng: checked }))}
              />
              Also save flat PNG
            </Label>
            <RadioGroup
              aria-label="Flat PNG glass"
              disabled={!options.flatPng}
              value={options.flatGlass}
              onValueChange={(value) =>
                setOptions((o) => ({ ...o, flatGlass: value as FlatGlass }))
              }
              className="ml-6 flex gap-5"
            >
              <Label className={labelClass}>
                <RadioGroupItem value="none" />
                No glass
              </Label>
              <Label className={labelClass}>
                <RadioGroupItem value="approximate" />
                Approximate glass
              </Label>
            </RadioGroup>
          </section>

          <section className="flex flex-col gap-2 border-t pt-4">
            <Label className={labelClass}>
              <Checkbox
                checked={options.combinedSvg}
                onCheckedChange={(checked) => setOptions((o) => ({ ...o, combinedSvg: checked }))}
              />
              Also save combined SVG
            </Label>
            <div className="ml-6">
              <Label className={labelClass}>
                <Checkbox
                  checked={options.combinedBackground}
                  disabled={!options.combinedSvg}
                  onCheckedChange={(checked) =>
                    setOptions((o) => ({ ...o, combinedBackground: checked }))
                  }
                />
                Include background
              </Label>
            </div>
          </section>
        </div>

        <DialogFooter className="mx-0 mb-0 px-4 py-3">
          <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
          <Button size="sm" disabled={empty || busy} onClick={onExport}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
