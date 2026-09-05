/** One layer: drag handle, visibility, glass, name, and the row context menu. */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, EyeOff, GripVertical, Sparkles } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import type { Layer } from '@/core/model/types'
import { mergeLayers as mergeLayersFn, splitLayer as splitLayerFn } from '@/core/svg'
import { useEditor } from '@/state'
import { IconButton } from '../lib/IconButton'

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
  const groups = useEditor((s) => s.doc.groups)
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

  /** Plain click selects; Cmd/Ctrl toggles this row; Shift extends from the anchor,
   * the first-selected row, across the panel's order. */
  const onNameClick = (e: MouseEvent): void => {
    if (e.metaKey || e.ctrlKey) {
      select(
        selected
          ? selection.layerIds.filter((id) => id !== layer.id)
          : [...selection.layerIds, layer.id],
      )
      return
    }
    if (e.shiftKey && selection.layerIds.length > 0) {
      const order = groups.flatMap((g) => g.layers.map((l) => l.id))
      const anchor = selection.layerIds[0] as string
      const from = order.indexOf(anchor)
      const to = order.indexOf(layer.id)
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from]
        const range = order.slice(lo, hi + 1).filter((id) => id !== anchor)
        select([anchor, ...range])
        return
      }
    }
    select([layer.id])
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
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={`group flex h-7 items-center gap-0.5 pr-1 pl-0.5 ${
                selected ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted'
              }`}
            />
          }
        >
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Reorder ${layer.name}`}
            className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/50 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>

          <IconButton
            label={layer.hidden ? `Show ${layer.name}` : `Hide ${layer.name}`}
            size="xs"
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
            size="xs"
            className={layer.glass ? 'text-primary hover:text-primary' : 'text-muted-foreground/50'}
            onClick={() => updateLayer(layer.id, { glass: !layer.glass })}
          >
            <Sparkles size={13} aria-hidden="true" />
          </IconButton>

          {draft === null ? (
            <button
              type="button"
              data-testid="layer-name"
              className={`min-w-0 flex-1 truncate px-1 text-left ${layer.hidden ? 'text-muted-foreground' : ''}`}
              onClick={onNameClick}
              onDoubleClick={() => setDraft(layer.name)}
            >
              {layer.name}
            </button>
          ) : (
            <Input
              autoFocus
              aria-label="Layer name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={onNameKeyDown}
              className="h-6 min-w-0 flex-1 px-1 text-xs md:text-xs"
            />
          )}

          {layer.issues.length > 0 ? (
            <span
              title={`${layer.issues.length} issues`}
              className="size-1.5 shrink-0 rounded-full bg-warning"
            />
          ) : null}
        </ContextMenuTrigger>

        <ContextMenuContent>
          <ContextMenuItem
            className="text-xs"
            onClick={run(() => useEditor.getState().splitLayer(layer.id, splitLayerFn))}
          >
            Split
          </ContextMenuItem>
          <ContextMenuItem
            className="text-xs"
            disabled={!canMerge}
            onClick={run(() => useEditor.getState().mergeLayers(ids, mergeLayersFn))}
          >
            Merge
          </ContextMenuItem>
          <ContextMenuItem
            className="text-xs"
            onClick={run(() => useEditor.getState().duplicateLayers(ids))}
          >
            Duplicate
          </ContextMenuItem>
          <ContextMenuItem
            className="text-xs"
            onClick={run(() => useEditor.getState().removeLayers(ids))}
          >
            Delete
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-xs"
            onClick={run(() => useEditor.getState().groupFromLayers(ids))}
          >
            Move to new group
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="text-xs" disabled={groups.length < 2}>
              Move to group
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {groups
                .filter((g) => g.id !== groupId)
                .map((g) => (
                  <ContextMenuItem
                    key={g.id}
                    className="text-xs"
                    onClick={run(() => {
                      const state = useEditor.getState()
                      for (const id of ids) state.moveLayer(id, g.id, 0)
                    })}
                  >
                    {g.name}
                  </ContextMenuItem>
                ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            className="text-xs"
            onClick={() => useEditor.getState().ungroup(groupId)}
          >
            Ungroup
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </li>
  )
}
