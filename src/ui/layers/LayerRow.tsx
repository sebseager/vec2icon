/** One layer: drag handle, visibility, glass, name, and the row context menu. */

import { ContextMenu } from '@base-ui/react/context-menu'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, Sparkles } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, useState } from 'react'
import type { Layer } from '@/core/model/types'
import { mergeLayers as mergeLayersFn, splitLayer as splitLayerFn } from '@/core/svg'
import { useEditor } from '@/state'
import { IconButton } from '../lib/IconButton'
import { menuItemClass, menuPopupClass } from './menuStyles'

/** The rows an action applies to: the whole selection when this row is part of it. */
const targetIds = (selected: string[], layerId: string): string[] =>
  selected.includes(layerId) ? selected : [layerId]

export const LayerRow = ({
  layer,
  groupId,
  groupLayerIds,
  index,
}: {
  layer: Layer
  groupId: string
  /** Every layer in this row's group, so Merge can tell whether the selection is mergeable. */
  groupLayerIds: readonly string[]
  index: number
}) => {
  const selection = useEditor((s) => s.selection)
  const select = useEditor((s) => s.select)
  const updateLayer = useEditor((s) => s.updateLayer)
  const [draft, setDraft] = useState<string | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id, data: { groupId, index } })

  const selected = selection.layerIds.includes(layer.id)
  const ids = targetIds(selection.layerIds, layer.id)
  const canMerge = ids.length > 1 && ids.every((id) => groupLayerIds.includes(id))

  const commitName = (): void => {
    const next = draft?.trim()
    if (next) updateLayer(layer.id, { name: next })
    setDraft(null)
  }

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') commitName()
    else if (e.key === 'Escape') setDraft(null)
  }

  const run = (fn: () => void) => (): void => {
    if (!selected) select([layer.id])
    fn()
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : undefined}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <div
              className={`group flex h-7 items-center gap-0.5 pr-1 pl-0.5 ${
                selected ? 'bg-accent-weak text-zinc-900' : 'text-zinc-700 hover:bg-zinc-100'
              }`}
            />
          }
        >
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Reorder ${layer.name}`}
            className="flex size-5 shrink-0 cursor-grab items-center justify-center text-zinc-300 hover:text-zinc-600 group-hover:text-zinc-400"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>

          <IconButton
            label={layer.hidden ? `Show ${layer.name}` : `Hide ${layer.name}`}
            className="size-6"
            onClick={() => updateLayer(layer.id, { hidden: !layer.hidden })}
          >
            {layer.hidden ? (
              <EyeOff size={14} aria-hidden="true" />
            ) : (
              <Eye size={14} aria-hidden="true" />
            )}
          </IconButton>

          <IconButton
            label={
              layer.glass ? `Turn off glass on ${layer.name}` : `Turn on glass on ${layer.name}`
            }
            className={`size-6 ${layer.glass ? 'text-accent' : 'text-zinc-300'}`}
            onClick={() => updateLayer(layer.id, { glass: !layer.glass })}
          >
            <Sparkles size={13} aria-hidden="true" />
          </IconButton>

          {draft === null ? (
            <button
              type="button"
              data-testid="layer-name"
              className={`min-w-0 flex-1 truncate px-1 text-left ${layer.hidden ? 'text-zinc-400' : ''}`}
              onClick={(e: MouseEvent) => select([layer.id], { additive: e.shiftKey })}
              onDoubleClick={() => setDraft(layer.name)}
            >
              {layer.name}
            </button>
          ) : (
            <input
              // biome-ignore lint/a11y/noAutofocus: the field replaces the name on double-click
              autoFocus
              aria-label="Layer name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={onNameKeyDown}
              className="min-w-0 flex-1 rounded-[3px] border border-accent bg-white px-1 text-zinc-900 outline-none"
            />
          )}

          {layer.issues.length > 0 ? (
            <span
              title={`${layer.issues.length} issues`}
              className="size-1.5 shrink-0 rounded-full bg-warn"
            />
          ) : null}
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Positioner>
            <ContextMenu.Popup className={menuPopupClass}>
              <ContextMenu.Item
                className={menuItemClass}
                onClick={run(() => useEditor.getState().splitLayer(layer.id, splitLayerFn))}
              >
                Split
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClass}
                disabled={!canMerge}
                onClick={run(() => useEditor.getState().mergeLayers(ids, mergeLayersFn))}
              >
                Merge
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClass}
                onClick={run(() => useEditor.getState().duplicateLayers(ids))}
              >
                Duplicate
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClass}
                onClick={run(() => useEditor.getState().removeLayers(ids))}
              >
                Delete
              </ContextMenu.Item>
              <ContextMenu.Separator className="my-1 h-px bg-zinc-200" />
              <ContextMenu.Item
                className={menuItemClass}
                onClick={run(() => useEditor.getState().groupFromLayers(ids))}
              >
                Move to new group
              </ContextMenu.Item>
              <ContextMenu.Item
                className={menuItemClass}
                onClick={() => useEditor.getState().ungroup(groupId)}
              >
                Ungroup
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </li>
  )
}
