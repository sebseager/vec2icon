/** A collapsible group: header, glass summary, and its layers top-most first. */
import { Menu } from '@base-ui/react/menu'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDown, ChevronRight, MoreHorizontal } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import type { Group } from '@/core/model/types'
import { useEditor } from '@/state'
import { IconButton } from '../lib/IconButton'
import { percent } from '../lib/options'
import { groupDropId } from './dropTarget'
import { LayerRow } from './LayerRow'
import { menuItemClass, menuPopupClass } from './menuStyles'

const glassSummary = (group: Group): string => {
  const { lighting, blurMaterial, shadow } = group.glass
  const light = lighting === 'individual' ? 'Individual' : 'Combined'
  const shadowText = shadow.kind === 'none' ? 'no shadow' : `shadow ${percent(shadow.opacity)}`
  return `${light} · blur ${percent(blurMaterial)} · ${shadowText}`
}

export const GroupSection = ({
  group,
  collapsed,
  onToggle,
}: {
  group: Group
  collapsed: boolean
  onToggle: (groupId: string) => void
}) => {
  const selected = useEditor((s) => s.selection.groupId === group.id)
  const selectGroup = useEditor((s) => s.selectGroup)
  const updateGroup = useEditor((s) => s.updateGroup)
  const removeGroup = useEditor((s) => s.removeGroup)
  const [draft, setDraft] = useState<string | null>(null)
  // Only a group with nothing to aim at takes drops as a whole: otherwise it would win the
  // closest-center check against its own rows and swallow drops meant for a position.
  const layerIds = group.layers.map((l) => l.id)
  const takesGroupDrop = collapsed || group.layers.length === 0
  const { setNodeRef } = useDroppable({ id: groupDropId(group.id), disabled: !takesGroupDrop })

  const commitName = (): void => {
    const next = draft?.trim()
    if (next) updateGroup(group.id, { name: next })
    setDraft(null)
  }

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') commitName()
    else if (e.key === 'Escape') setDraft(null)
  }

  return (
    <section className="border-zinc-200 border-b">
      <div
        ref={collapsed ? setNodeRef : undefined}
        className={`flex h-7 items-center gap-0.5 pr-1 pl-0.5 ${
          selected ? 'bg-accent-weak text-zinc-900' : 'text-zinc-800 hover:bg-zinc-100'
        }`}
      >
        <IconButton
          label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
          className="size-5"
          onClick={() => onToggle(group.id)}
        >
          {collapsed ? (
            <ChevronRight size={14} aria-hidden="true" />
          ) : (
            <ChevronDown size={14} aria-hidden="true" />
          )}
        </IconButton>

        {draft === null ? (
          <button
            type="button"
            className="min-w-0 flex-1 truncate px-1 text-left font-medium"
            onClick={() => selectGroup(group.id)}
            onDoubleClick={() => setDraft(group.name)}
          >
            {group.name}
          </button>
        ) : (
          <input
            // biome-ignore lint/a11y/noAutofocus: the field replaces the name on double-click
            autoFocus
            aria-label="Group name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={onNameKeyDown}
            className="min-w-0 flex-1 rounded-[3px] border border-accent bg-white px-1 text-zinc-900 outline-none"
          />
        )}

        <Menu.Root>
          <Menu.Trigger
            aria-label={`${group.name} options`}
            className="flex size-6 items-center justify-center rounded-[3px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <MoreHorizontal size={14} aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner side="bottom" align="end" sideOffset={4}>
              <Menu.Popup className={menuPopupClass}>
                <Menu.Item className={menuItemClass} onClick={() => setDraft(group.name)}>
                  Rename
                </Menu.Item>
                <Menu.Item className={menuItemClass} onClick={() => removeGroup(group.id, false)}>
                  Delete group
                </Menu.Item>
                <Menu.Item className={menuItemClass} onClick={() => removeGroup(group.id, true)}>
                  Delete group, keep layers
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {collapsed ? null : (
        <>
          <p className="px-1.5 pb-1 pl-6 text-[11px] text-zinc-500">{glassSummary(group)}</p>
          <SortableContext items={layerIds} strategy={verticalListSortingStrategy}>
            <ul className="pb-1">
              {group.layers.map((layer, index) => (
                <LayerRow
                  key={layer.id}
                  layer={layer}
                  groupId={group.id}
                  groupLayerIds={layerIds}
                  index={index}
                />
              ))}
              {group.layers.length === 0 ? (
                <li
                  ref={setNodeRef}
                  className="mx-1.5 mb-1 border border-zinc-200 border-dashed px-2 py-1.5 text-zinc-400"
                >
                  Drop layers here
                </li>
              ) : null}
            </ul>
          </SortableContext>
        </>
      )}
    </section>
  )
}
