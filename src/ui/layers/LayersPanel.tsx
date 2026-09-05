/** Left pane: every group and layer, top-most first, reorderable by pointer or keyboard. */
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import { useEditor } from '@/state'
import { dropTarget } from './dropTarget'
import { GroupSection } from './GroupSection'

export const LayersPanel = () => {
  const groups = useEditor((s) => s.doc.groups)
  const moveLayer = useEditor((s) => s.moveLayer)
  const [collapsed, setCollapsed] = useState<readonly string[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onToggle = (groupId: string): void =>
    setCollapsed((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    )

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    const target = dropTarget(
      over ? { id: String(over.id), data: over.data.current ?? {} } : null,
      groups,
    )
    if (target) moveLayer(String(active.id), target.groupId, target.index)
  }

  return (
    <aside
      aria-label="Layers"
      className="flex w-64 shrink-0 flex-col overflow-y-auto border-zinc-200 border-r bg-white"
    >
      {groups.length === 0 ? (
        <p className="p-3 text-zinc-500">
          No layers yet. Drop SVG files anywhere in the window, or use Import.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          {groups.map((group) => (
            <GroupSection
              key={group.id}
              group={group}
              collapsed={collapsed.includes(group.id)}
              onToggle={onToggle}
            />
          ))}
        </DndContext>
      )}
    </aside>
  )
}
