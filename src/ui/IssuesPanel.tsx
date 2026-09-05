/** Top-bar badge and the list of everything Icon Composer will not render as drawn. */
import { TriangleAlert } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import type { Issue, IssueCode, Layer } from '@/core/model/types'
import { lintDoc } from '@/core/svg'
import { useEditor } from '@/state'
import { applyIssueFix, applyIssueFixToAll, FIX_ALL_CODES } from './lib/applyFix'
import { HelpTip } from './lib/HelpTip'

const FixButtons = ({ layer, issue }: { layer: Layer; issue: Issue }) => {
  if (issue.fixes.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {issue.fixes.map((fix) => (
        <span key={fix.id} className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={() => applyIssueFix(useEditor.getState(), layer, issue.code, fix.id)}
          >
            {fix.label}
          </Button>
          {fix.warning ? <span className="text-warning">{fix.warning}</span> : null}
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
    <Popover open={open} onOpenChange={(next) => setView({ issuesOpen: next })}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={count === 1 ? '1 issue' : `${count} issues`}
            className="border-warning/40 bg-warning-foreground text-warning hover:border-warning hover:bg-warning-foreground hover:text-warning aria-expanded:bg-warning-foreground aria-expanded:text-warning"
          />
        }
      >
        <TriangleAlert size={14} aria-hidden="true" data-icon="inline-start" />
        {count}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="max-h-[70vh] w-96 gap-0 overflow-y-auto p-0 text-xs"
      >
        <PopoverTitle className="border-b px-3 py-2 text-foreground">Issues</PopoverTitle>

        {docIssues.map((issue) => (
          <div key={issue.code} className="border-b px-3 py-2">
            <div className="flex items-start gap-1.5">
              <span className="flex-1 text-foreground">{issue.message}</span>
              {issue.help ? <HelpTip topic={issue.message}>{issue.help}</HelpTip> : null}
            </div>
          </div>
        ))}

        {layers.map((layer) => (
          <div key={layer.id} className="border-b px-3 py-2">
            {layer.issues.map((issue) => (
              <div key={issue.code} className="not-first:mt-2">
                <div className="flex items-start gap-1.5">
                  <span className="flex-1 text-foreground">
                    <span className="text-muted-foreground">{layer.name}</span> &mdash;{' '}
                    {issue.message}
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
            <Button
              variant="outline"
              size="xs"
              onClick={() => applyIssueFixToAll(useEditor.getState(), bulk.code, bulk.fixId)}
            >
              {bulk.label} on all layers
            </Button>
            <span className="text-muted-foreground">{bulk.count} layers</span>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
