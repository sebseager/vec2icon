/** Describe a change to one layer; Claude edits that layer's artwork and nothing else. */
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
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
import {
  ADJUST_SYSTEM_PROMPT,
  type AdjustedArt,
  adjustMessage,
  adjustTask,
  costBound,
  estimateTokens,
  layerDocument,
  MAX_OUTPUT_TOKENS,
  OPUS_5_PRICING,
  runTask,
  type Usage,
} from '@/core/compose'
import type { Layer } from '@/core/model/types'
import { useEditor } from '@/state'
import { idbKeyStore, type KeyStore } from './lib/keyStorage'
import {
  CostLine,
  FixBudget,
  fieldClass,
  KeySection,
  Problems,
  spent,
  useApiKey,
  useTaskRun,
} from './parts'

const SYSTEM_TOKENS = estimateTokens(ADJUST_SYSTEM_PROMPT)
const PLACEHOLDER = 'Make the cloud fluffier and pure white.'

const findLayer = (groups: { layers: Layer[] }[], id: string | null): Layer | null => {
  if (!id) return null
  for (const group of groups) {
    const layer = group.layers.find((l) => l.id === id)
    if (layer) return layer
  }
  return null
}

export const AdjustDialog = ({ keyStore = idbKeyStore }: { keyStore?: KeyStore }) => {
  const layerId = useEditor((s) => s.view.adjustLayerId)
  const groups = useEditor((s) => s.doc.groups)
  const setView = useEditor((s) => s.setView)
  const pushToast = useEditor((s) => s.pushToast)
  const applyFixResult = useEditor((s) => s.applyFixResult)

  const layer = findLayer(groups, layerId)
  const open = layer !== null
  const { savedKey, saveKey, forgetKey } = useApiKey(open, keyStore)
  const [instruction, setInstruction] = useState('')
  const [autoFix, setAutoFix] = useState(true)
  const [fixTurns, setFixTurns] = useState(1)
  const instructionId = useId()

  const close = () => {
    cancel()
    setInstruction('')
    setView({ adjustLayerId: null })
  }

  const finish = (art: AdjustedArt, usages: Usage[], problems: string[]) => {
    if (!layer) return
    applyFixResult(layer.id, { ...layer, ...art })
    const caveat = problems.length > 0 ? ` with ${problems.length} open issue(s)` : ''
    pushToast({ message: `Adjusted "${layer.name}"${caveat} for ${spent(usages)}` })
    close()
  }

  const { phase, running, start, cancel } = useTaskRun<AdjustedArt>((outcome) =>
    finish(outcome.parsed, outcome.usages, []),
  )

  const effectiveFixTurns = autoFix ? fixTurns : 0
  const bound = layer
    ? costBound({
        systemTokens: SYSTEM_TOKENS,
        briefTokens: estimateTokens(adjustMessage(instruction, layerDocument(layer))),
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        fixTurns: effectiveFixTurns,
        pricing: OPUS_5_PRICING,
      })
    : 0

  const adjust = () => {
    if (!layer || !savedKey || !instruction.trim()) return
    const task = adjustTask(instruction, layer)
    void start(savedKey, (generate, signal, onProgress) =>
      runTask(generate, task, { fixTurns: effectiveFixTurns, signal }, onProgress),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent
        showCloseButton={false}
        className="w-[27rem] max-w-[calc(100vw-2rem)] gap-0 p-0 text-xs sm:max-w-[27rem]"
      >
        <DialogHeader className="gap-0.5 border-b px-4 py-3">
          <DialogTitle className="text-[13px]">AI Adjust</DialogTitle>
          <DialogDescription className="text-xs">
            Describe a change and Claude Opus edits the artwork of &ldquo;{layer?.name}&rdquo;,
            leaving every other layer alone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-4 py-4">
          <KeySection
            savedKey={savedKey}
            onSave={saveKey}
            onForget={forgetKey}
            disabled={running}
          />

          <section className="flex flex-col gap-1.5 border-t pt-4">
            <Label htmlFor={instructionId} className="text-xs font-normal">
              What should change?
            </Label>
            <textarea
              id={instructionId}
              rows={3}
              placeholder={PLACEHOLDER}
              value={instruction}
              disabled={running}
              onChange={(e) => setInstruction(e.target.value)}
              className={`${fieldClass} resize-y leading-relaxed`}
            />
          </section>

          <FixBudget
            autoFix={autoFix}
            fixTurns={fixTurns}
            onAutoFix={setAutoFix}
            onFixTurns={setFixTurns}
            disabled={running}
          />

          {phase.kind === 'invalid' ? <Problems problems={phase.outcome.problems} /> : null}

          <CostLine phase={phase} bound={bound} />
        </div>

        <DialogFooter className="mx-0 mb-0 px-4 py-3">
          {running ? (
            <Button variant="outline" size="sm" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <DialogClose render={<Button variant="outline" size="sm" />}>Close</DialogClose>
          )}
          {phase.kind === 'invalid' && phase.outcome.parsed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (phase.outcome.parsed) {
                  finish(phase.outcome.parsed, phase.outcome.usages, phase.outcome.problems)
                }
              }}
            >
              Apply anyway
            </Button>
          ) : null}
          <Button size="sm" disabled={running || !savedKey || !instruction.trim()} onClick={adjust}>
            {phase.kind === 'invalid' ? 'Try again' : 'Adjust'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
