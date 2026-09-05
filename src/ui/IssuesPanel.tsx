/** Top-bar badge and the list of everything Icon Composer will not render as drawn. */
import { Popover } from '@base-ui/react/popover'
import { TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import type { Issue, IssueCode, Layer } from '@/core/model/types'
import { lintDoc } from '@/core/svg'
import { useEditor } from '@/state'
import { applyIssueFix, applyIssueFixToAll, FIX_ALL_CODES } from './lib/applyFix'
import { HelpTip } from './lib/HelpTip'

const FixButtons = ({ layer, issue }: { layer: Layer; issue: Issue }) => {
  if (issue.fixes.length === 0) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {issue.fixes.map((fix) => (
        <span key={fix.id} className="flex items-center gap-1.5">
          <button
            type="button"
            className="h-6 rounded-[3px] border border-zinc-300 px-2 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-100"
            onClick={() => applyIssueFix(useEditor.getState(), layer, issue.code, fix.id)}
          >
            {fix.label}
          </button>
          {fix.warning ? <span className="text-warn">{fix.warning}</span> : null}
        </span>
      ))}
    </div>
  )
}

const bulkFixes = (
  layers: Layer[],
): { code: IssueCode; label: string; fixId: string; count: number }[] =>
  FIX_ALL_CODES.flatMap((code) => {
    const affected = layers.filter((l) => l.issues.some((i) => i.code === code))
    const fix = affected[0]?.issues.find((i) => i.code === code)?.fixes[0]
    return affected.length > 1 && fix
      ? [{ code, label: fix.label, fixId: fix.id, count: affected.length }]
      : []
  })

export const IssuesPanel = () => {
  const doc = useEditor((s) => s.doc)
  const open = useEditor((s) => s.view.issuesOpen)
  const setView = useEditor((s) => s.setView)

  const { docIssues, layers, count } = useMemo(() => {
    const docIssues = lintDoc(doc)
    const layers = doc.groups.flatMap((g) => g.layers).filter((l) => l.issues.length > 0)
    const count = docIssues.length + layers.reduce((n, l) => n + l.issues.length, 0)
    return { docIssues, layers, count }
  }, [doc])

  if (count === 0) return null

  return (
    <Popover.Root open={open} onOpenChange={(next) => setView({ issuesOpen: next })}>
      <Popover.Trigger
        aria-label={count === 1 ? '1 issue' : `${count} issues`}
        className="flex h-7 items-center gap-1.5 rounded-[3px] border border-warn/40 bg-warn-weak px-2 text-warn hover:border-warn"
      >
        <TriangleAlert size={14} aria-hidden="true" />
        {count}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6}>
          <Popover.Popup className="max-h-[70vh] w-96 overflow-y-auto border border-zinc-300 bg-white shadow-xl shadow-black/10">
            <Popover.Title className="border-zinc-200 border-b px-3 py-2 font-medium text-zinc-900">
              Issues
            </Popover.Title>

            {docIssues.map((issue) => (
              <div key={issue.code} className="border-zinc-200 border-b px-3 py-2">
                <div className="flex items-start gap-1.5">
                  <span className="flex-1 text-zinc-800">{issue.message}</span>
                  {issue.help ? <HelpTip topic={issue.message}>{issue.help}</HelpTip> : null}
                </div>
              </div>
            ))}

            {layers.map((layer) => (
              <div key={layer.id} className="border-zinc-200 border-b px-3 py-2">
                {layer.issues.map((issue) => (
                  <div key={issue.code} className="not-first:mt-2">
                    <div className="flex items-start gap-1.5">
                      <span className="flex-1 text-zinc-800">
                        <span className="text-zinc-600">{layer.name}</span> &mdash; {issue.message}
                      </span>
                      {issue.help ? <HelpTip topic={issue.message}>{issue.help}</HelpTip> : null}
                    </div>
                    <FixButtons layer={layer} issue={issue} />
                  </div>
                ))}
              </div>
            ))}

            {bulkFixes(layers).map((bulk) => (
              <div key={bulk.code} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  className="h-6 rounded-[3px] border border-zinc-300 px-2 text-zinc-800 hover:border-zinc-400 hover:bg-zinc-100"
                  onClick={() => applyIssueFixToAll(useEditor.getState(), bulk.code, bulk.fixId)}
                >
                  {bulk.label} on all layers
                </button>
                <span className="text-zinc-500">{bulk.count} layers</span>
              </div>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
