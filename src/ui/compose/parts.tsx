/** Pieces the Compose and Adjust dialogs share: the key, the fix budget, the cost line,
 * the problem list, and the hook that runs a model task and tracks where it is. */
import { ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type ComposeProgress,
  costOf,
  formatUsd,
  OPUS_5_PRICING,
  type Outcome,
  type Usage,
} from '@/core/compose'
import { useEditor } from '@/state'
import { Toggle } from '../lib/Toggle'
import { createGenerate } from './lib/anthropic'
import { idbKeyStore, type KeyStore } from './lib/keyStorage'

export const MAX_FIX_TURNS = 3
const CONSOLE_KEYS_URL = 'https://console.anthropic.com/settings/keys'

export const fieldClass =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

export const clampTurns = (value: number): number =>
  Math.min(MAX_FIX_TURNS, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)))

/** The stored key, loaded whenever the dialog opens, and the two ways it changes. */
export const useApiKey = (
  open: boolean,
  keyStore: KeyStore = idbKeyStore,
): { savedKey: string | null; saveKey: (key: string) => void; forgetKey: () => void } => {
  const pushToast = useEditor((s) => s.pushToast)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    void keyStore.load().then((key) => {
      if (live) setSavedKey(key)
    })
    return () => {
      live = false
    }
  }, [open, keyStore])

  const saveKey = (key: string) => {
    setSavedKey(key)
    void keyStore.save(key).catch(() => pushToast({ message: 'Could not store the API key.' }))
  }
  const forgetKey = () => {
    setSavedKey(null)
    void keyStore.forget().catch(() => pushToast({ message: 'Could not forget the API key.' }))
  }
  return { savedKey, saveKey, forgetKey }
}

export const KeySection = ({
  savedKey,
  onSave,
  onForget,
  disabled,
}: {
  savedKey: string | null
  onSave: (key: string) => void
  onForget: () => void
  disabled: boolean
}) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const id = useId()
  const showForm = savedKey === null || editing

  const save = () => {
    const key = draft.trim()
    if (!key) return
    onSave(key)
    setDraft('')
    setEditing(false)
  }

  if (!showForm) {
    return (
      <section className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-muted-foreground">API key saved in this browser</span>
        <Button variant="outline" size="xs" disabled={disabled} onClick={() => setEditing(true)}>
          Change
        </Button>
        <Button variant="outline" size="xs" disabled={disabled} onClick={onForget}>
          Forget
        </Button>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal">
        Anthropic API key
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-ant-…"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          className="h-7 text-xs md:text-xs"
        />
        <Button size="sm" disabled={disabled || !draft.trim()} onClick={save}>
          Save
        </Button>
        {savedKey !== null ? (
          <Button variant="outline" size="sm" disabled={disabled} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p className="leading-relaxed text-muted-foreground">
        Kept only in this browser and sent only to api.anthropic.com. Usage is billed to your
        Anthropic account.{' '}
        <a
          href={CONSOLE_KEYS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-foreground underline underline-offset-2"
        >
          Create a key
          <ExternalLink size={10} aria-hidden="true" />
        </a>
      </p>
    </section>
  )
}

export const FixBudget = ({
  autoFix,
  fixTurns,
  onAutoFix,
  onFixTurns,
  disabled,
}: {
  autoFix: boolean
  fixTurns: number
  onAutoFix: (on: boolean) => void
  onFixTurns: (turns: number) => void
  disabled: boolean
}) => {
  const turnsId = useId()
  return (
    <section className="flex flex-col gap-2 border-t pt-4">
      <div className="flex h-6 items-center gap-2">
        <span className="min-w-0 flex-1">Fix rejected output automatically</span>
        <Toggle
          label="Fix rejected output automatically"
          checked={autoFix}
          onChange={onAutoFix}
          disabled={disabled}
        />
      </div>
      <div className="flex h-6 items-center gap-2">
        <Label htmlFor={turnsId} className="min-w-0 flex-1 text-xs font-normal">
          Extra turns, at most
        </Label>
        <Input
          id={turnsId}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_FIX_TURNS}
          step={1}
          value={fixTurns}
          disabled={disabled || !autoFix}
          onChange={(e) => onFixTurns(clampTurns(Number.parseInt(e.target.value, 10)))}
          className="h-6 w-14 px-1.5 text-xs md:text-xs"
        />
      </div>
      <p className="leading-relaxed text-muted-foreground">
        When the SVG fails the import checks, each extra turn hands it back to the model with the
        reasons. Otherwise you can still apply it and fix it by hand.
      </p>
    </section>
  )
}

export const Problems = ({ problems }: { problems: string[] }) => (
  <section className="flex flex-col gap-1.5 border-t pt-4">
    <span className="font-medium text-warning">Still not right after every turn</span>
    <ul className="max-h-32 list-disc space-y-1 overflow-y-auto pl-4 leading-relaxed text-muted-foreground">
      {problems.map((problem) => (
        <li key={problem}>{problem}</li>
      ))}
    </ul>
  </section>
)

const progressLabel = (progress: ComposeProgress | null): string => {
  if (!progress) return 'Starting…'
  if (progress.kind === 'compose') return 'Working…'
  return `Fixing (turn ${progress.turn} of ${progress.totalTurns})…`
}

export type Phase<P> =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ComposeProgress | null }
  | { kind: 'invalid'; outcome: Extract<Outcome<P>, { status: 'invalid' }> }

/** The bound before a run, progress during it, and what it cost once it failed. */
export const CostLine = <P,>({ phase, bound }: { phase: Phase<P>; bound: number }) => (
  <section className="flex items-center gap-2 border-t pt-4 text-muted-foreground">
    {phase.kind === 'running' ? (
      <span aria-live="polite" className="min-w-0 flex-1">
        {progressLabel(phase.progress)}
      </span>
    ) : phase.kind === 'invalid' ? (
      <span className="min-w-0 flex-1">
        Spent {formatUsd(costOf(phase.outcome.usages, OPUS_5_PRICING))}
      </span>
    ) : (
      <span className="min-w-0 flex-1">
        Costs at most {formatUsd(bound)}, billed to your Anthropic account
      </span>
    )}
  </section>
)

export const spent = (usages: Usage[]): string => formatUsd(costOf(usages, OPUS_5_PRICING))

/** Runs one task against the API, keeping the phase for the dialog to draw. `onOk` gets a
 * good result; an exhausted budget lands in the `invalid` phase for the dialog to offer. */
export const useTaskRun = <P,>(
  onOk: (outcome: Extract<Outcome<P>, { status: 'ok' }>) => void,
): {
  phase: Phase<P>
  running: boolean
  start: (
    apiKey: string,
    run: (
      generate: ReturnType<typeof createGenerate>,
      signal: AbortSignal,
      onProgress: (progress: ComposeProgress) => void,
    ) => Promise<Outcome<P>>,
  ) => Promise<void>
  cancel: () => void
} => {
  const pushToast = useEditor((s) => s.pushToast)
  const [phase, setPhase] = useState<Phase<P>>({ kind: 'idle' })
  const controller = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setPhase({ kind: 'idle' })
  }, [])

  const start = async (
    apiKey: string,
    run: (
      generate: ReturnType<typeof createGenerate>,
      signal: AbortSignal,
      onProgress: (progress: ComposeProgress) => void,
    ) => Promise<Outcome<P>>,
  ) => {
    const abort = new AbortController()
    controller.current = abort
    setPhase({ kind: 'running', progress: null })
    try {
      const outcome = await run(createGenerate(apiKey), abort.signal, (progress) =>
        setPhase({ kind: 'running', progress }),
      )
      if (abort.signal.aborted) return
      if (outcome.status === 'ok') {
        setPhase({ kind: 'idle' })
        onOk(outcome)
      } else if (outcome.status === 'invalid') {
        setPhase({ kind: 'invalid', outcome })
      } else {
        if (outcome.status === 'refused')
          pushToast({ message: `Claude declined: ${outcome.reason}` })
        setPhase({ kind: 'idle' })
      }
    } catch (error) {
      if (abort.signal.aborted) return
      const reason = error instanceof Error ? error.message : 'unknown error'
      pushToast({ message: `Request failed: ${reason}` })
      setPhase({ kind: 'idle' })
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  return { phase, running: phase.kind === 'running', start, cancel }
}
