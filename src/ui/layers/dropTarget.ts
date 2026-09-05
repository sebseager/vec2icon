/** Resolving a drag's drop target to a group and an insertion index. */

export const groupDropId = (groupId: string): string => `group:${groupId}`

export type DropSlot = { groupId: string; index: number }

/** The parts of dnd-kit's `over` this needs. */
export type DropOver = { id: string; data?: { groupId?: string; index?: number } }

type GroupShape = { id: string; layers: { id: string }[] }

/**
 * A layer row inserts at that row's index; a group's own droppable — registered only when the
 * group is empty or collapsed, so it never competes with the rows — appends to the bottom.
 */
export const dropTarget = (
  over: DropOver | null,
  groups: readonly GroupShape[],
): DropSlot | null => {
  if (!over) return null
  for (const group of groups) {
    if (over.id === groupDropId(group.id)) return { groupId: group.id, index: group.layers.length }
  }
  const { groupId, index } = over.data ?? {}
  return typeof groupId === 'string' && typeof index === 'number' ? { groupId, index } : null
}
