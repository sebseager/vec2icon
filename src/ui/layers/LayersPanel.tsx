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
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { createGroup } from '@/core/model/defaults'
import { useEditor } from '@/state'
import { IconButton } from '../lib/IconButton'
import { dropTarget } from './dropTarget'
import { GroupSection } from './GroupSection'

export const LayersPanel = () => {
  const groups = useEditor((s) => s.doc.groups)
  const moveLayer = useEditor((s) => s.moveLayer)
  const addGroups = useEditor((s) => s.addGroups)
  const selectGroup = useEditor((s) => s.selectGroup)
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

  const newGroup = (): void => {
    const group = createGroup('New group')
    addGroups([group], 0)
    selectGroup(group.id)
  }

  return (
    <aside
      aria-label="Layers"
      className="flex w-64 shrink-0 flex-col overflow-y-auto border-r bg-background"
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b pr-1 pl-3">
        <span className="flex-1 font-medium text-[11px] text-muted-foreground">Layers</span>
        <IconButton label="New group" onClick={newGroup}>
          <Plus size={15} aria-hidden="true" />
        </IconButton>
      </div>
      {groups.length === 0 ? (
        <p className="p-3 text-muted-foreground">
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
