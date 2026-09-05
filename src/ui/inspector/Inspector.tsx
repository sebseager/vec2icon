/** Right pane. The appearance switch scopes everything below it. */
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
      <Tabs
        value={appearance}
        onValueChange={(value) => setView({ appearance: value as Appearance })}
        className="min-w-0 flex-1"
      >
        <TabsList className="w-full flex-1">
          {APPEARANCE_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
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
      className="flex w-72 shrink-0 flex-col overflow-y-auto border-l bg-background"
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
