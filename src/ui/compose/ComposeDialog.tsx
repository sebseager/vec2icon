/** Describe an icon; Claude draws it as layered SVG and it lands in the document like a drop. */
import { ExternalLink } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  briefMessage,
  type ComposeOutcome,
  type ComposeProgress,
  composeIcon,
  costBound,
  costOf,
  estimateTokens,
  formatUsd,
  MAX_OUTPUT_TOKENS,
  OPUS_5_PRICING,
  type Parsed,
  SYSTEM_PROMPT,
  type Usage,
} from '@/core/compose'
import { useEditor } from '@/state'
import { Toggle } from '../lib/Toggle'
import { createGenerate } from './lib/anthropic'
import { idbKeyStore, type KeyStore } from './lib/keyStorage'

export const MAX_FIX_TURNS = 3
const SYSTEM_TOKENS = estimateTokens(SYSTEM_PROMPT)
const CONSOLE_KEYS_URL = 'https://console.anthropic.com/settings/keys'
const PLACEHOLDER = 'A weather app: a sun peeking out from behind a cloud, bright and friendly.'

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ComposeProgress | null }
  | { kind: 'invalid'; outcome: Extract<ComposeOutcome, { status: 'invalid' }> }

const fieldClass =
  'w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

const clampTurns = (value: number): number =>
  Math.min(MAX_FIX_TURNS, Math.max(1, Math.round(Number.isFinite(value) ? value : 1)))

const progressLabel = (progress: ComposeProgress | null): string => {
  if (!progress) return 'Starting…'
  if (progress.kind === 'compose') return 'Composing…'
  return `Fixing (turn ${progress.turn} of ${progress.totalTurns})…`
}

const KeySection = ({
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

const Problems = ({ problems }: { problems: string[] }) => (
  <ul className="max-h-32 list-disc space-y-1 overflow-y-auto pl-4 leading-relaxed text-muted-foreground">
    {problems.map((problem) => (
      <li key={problem}>{problem}</li>
    ))}
  </ul>
)

export const ComposeDialog = ({ keyStore = idbKeyStore }: { keyStore?: KeyStore }) => {
  const open = useEditor((s) => s.view.composeOpen)
  const setView = useEditor((s) => s.setView)
  const pushToast = useEditor((s) => s.pushToast)
  const importComposed = useEditor((s) => s.importComposed)

  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [wish, setWish] = useState('')
  const [autoFix, setAutoFix] = useState(true)
  const [fixTurns, setFixTurns] = useState(1)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const controller = useRef<AbortController | null>(null)
  const wishId = useId()
  const turnsId = useId()

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

  const running = phase.kind === 'running'
  const effectiveFixTurns = autoFix ? fixTurns : 0
  const bound = costBound({
    systemTokens: SYSTEM_TOKENS,
    briefTokens: estimateTokens(briefMessage(wish)),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    fixTurns: effectiveFixTurns,
    pricing: OPUS_5_PRICING,
  })

  const close = () => {
    controller.current?.abort()
    controller.current = null
    setPhase({ kind: 'idle' })
    setView({ composeOpen: false })
  }

  const saveKey = (key: string) => {
    setSavedKey(key)
    void keyStore.save(key).catch(() => pushToast({ message: 'Could not store the API key.' }))
  }

  const forgetKey = () => {
    setSavedKey(null)
    void keyStore.forget().catch(() => pushToast({ message: 'Could not forget the API key.' }))
  }

  const finish = (parsed: Parsed, usages: Usage[], problems: string[]) => {
    importComposed(parsed.groups, parsed.fill, parsed.name)
    const cost = formatUsd(costOf(usages, OPUS_5_PRICING))
    const caveat = problems.length > 0 ? ` with ${problems.length} open issue(s)` : ''
    pushToast({ message: `Composed "${parsed.name}"${caveat} for ${cost}` })
    close()
  }

  const compose = async () => {
    if (!savedKey || !wish.trim()) return
    const abort = new AbortController()
    controller.current = abort
    setPhase({ kind: 'running', progress: null })
    try {
      const outcome = await composeIcon(
        createGenerate(savedKey),
        { wish, fixTurns: effectiveFixTurns, signal: abort.signal },
        (progress) => setPhase({ kind: 'running', progress }),
      )
      if (abort.signal.aborted) return
      if (outcome.status === 'ok') {
        finish(outcome.parsed, outcome.usages, [])
      } else if (outcome.status === 'invalid') {
        setPhase({ kind: 'invalid', outcome })
      } else if (outcome.status === 'refused') {
        pushToast({ message: `Claude declined: ${outcome.reason}` })
        setPhase({ kind: 'idle' })
      } else {
        setPhase({ kind: 'idle' })
      }
    } catch (error) {
      if (abort.signal.aborted) return
      const reason = error instanceof Error ? error.message : 'unknown error'
      pushToast({ message: `Compose failed: ${reason}` })
      setPhase({ kind: 'idle' })
    } finally {
      if (controller.current === abort) controller.current = null
    }
  }

  const cancelRun = () => {
    controller.current?.abort()
    controller.current = null
    setPhase({ kind: 'idle' })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setView({ composeOpen: true }) : close())}>
      <DialogContent
        showCloseButton={false}
        className="w-[27rem] max-w-[calc(100vw-2rem)] gap-0 p-0 text-xs sm:max-w-[27rem]"
      >
        <DialogHeader className="gap-0.5 border-b px-4 py-3">
          <DialogTitle className="text-[13px]">AI Compose</DialogTitle>
          <DialogDescription className="text-xs">
            Describe an icon and Claude Opus draws it as layered SVG, straight into the document.
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
            <Label htmlFor={wishId} className="text-xs font-normal">
              What should the icon show?
            </Label>
            <textarea
              id={wishId}
              rows={3}
              placeholder={PLACEHOLDER}
              value={wish}
              disabled={running}
              onChange={(e) => setWish(e.target.value)}
              className={`${fieldClass} resize-y leading-relaxed`}
            />
          </section>

          <section className="flex flex-col gap-2 border-t pt-4">
            <div className="flex h-6 items-center gap-2">
              <span className="min-w-0 flex-1">Fix rejected output automatically</span>
              <Toggle
                label="Fix rejected output automatically"
                checked={autoFix}
                onChange={setAutoFix}
                disabled={running}
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
                disabled={running || !autoFix}
                onChange={(e) => setFixTurns(clampTurns(Number.parseInt(e.target.value, 10)))}
                className="h-6 w-14 px-1.5 text-xs md:text-xs"
              />
            </div>
            <p className="leading-relaxed text-muted-foreground">
              When the SVG fails the import checks, each extra turn hands it back to the model with
              the reasons. Otherwise you can still import it and fix it by hand.
            </p>
          </section>

          {phase.kind === 'invalid' ? (
            <section className="flex flex-col gap-1.5 border-t pt-4">
              <span className="font-medium text-warning">Still not right after every turn</span>
              <Problems problems={phase.outcome.problems} />
            </section>
          ) : null}

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
        </div>

        <DialogFooter className="mx-0 mb-0 px-4 py-3">
          {phase.kind === 'running' ? (
            <Button variant="outline" size="sm" onClick={cancelRun}>
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
              Import anyway
            </Button>
          ) : null}
          <Button size="sm" disabled={running || !savedKey || !wish.trim()} onClick={compose}>
            {phase.kind === 'invalid' ? 'Try again' : 'Compose'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
