/** Right pane. The appearance switch scopes everything below it. */
import { findGroup, findLayer } from '@/core/model/ops'
import type { Appearance } from '@/core/model/types'
import { useEditor } from '@/state'
import { HelpTip } from '../lib/HelpTip'
import { DocInspector } from './DocInspector'
import { GroupInspector } from './GroupInspector'
import { LayerInspector } from './LayerInspector'

const APPEARANCE_TABS: readonly { value: Appearance; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'dark', label: 'Dark' },
  { value: 'mono', label: 'Mono' },
]

const AppearanceSwitch = () => {
  const appearance = useEditor((s) => s.view.appearance)
  const setView = useEditor((s) => s.setView)
  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-zinc-200 border-b px-3">
      <div className="flex flex-1 rounded-[3px] border border-zinc-300 p-px">
        {APPEARANCE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={appearance === tab.value}
            className={`h-5 flex-1 rounded-[2px] ${
              appearance === tab.value
                ? 'bg-accent-weak text-zinc-900'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
            onClick={() => setView({ appearance: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <HelpTip topic="Appearance">
        Which set of values the inspector edits. Default is the base artwork; Dark and Mono hold
        overrides on top of it. The canvas keeps showing the rendition picked in the toolbar.
      </HelpTip>
    </div>
  )
}

export const Inspector = () => {
  const doc = useEditor((s) => s.doc)
  const selection = useEditor((s) => s.selection)
  const appearance = useEditor((s) => s.view.appearance)

  const layers = selection.layerIds
    .map((id) => findLayer(doc, id)?.layer)
    .filter((layer) => layer !== undefined)
  const group = selection.groupId === null ? null : findGroup(doc, selection.groupId)?.group

  return (
    <aside
      aria-label="Inspector"
      className="flex w-72 shrink-0 flex-col overflow-y-auto border-zinc-200 border-l bg-white"
    >
      <AppearanceSwitch />
      {layers.length > 0 ? (
        <LayerInspector layers={layers} appearance={appearance} />
      ) : group ? (
        <GroupInspector group={group} />
      ) : (
        <DocInspector />
      )}
    </aside>
  )
}
