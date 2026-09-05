import { describe, expect, it } from 'vitest'
import { dropTarget, groupDropId } from './dropTarget'

const groups = [
  { id: 'g1', layers: [{ id: 'a' }, { id: 'b' }] },
  { id: 'g2', layers: [] },
]

describe('dropTarget', () => {
  it('inserts at the row the layer was dropped on', () => {
    expect(dropTarget({ id: 'b', data: { groupId: 'g1', index: 1 } }, groups)).toEqual({
      groupId: 'g1',
      index: 1,
    })
  })

  it('appends when dropped on a group rather than a row', () => {
    expect(dropTarget({ id: groupDropId('g1'), data: {} }, groups)).toEqual({
      groupId: 'g1',
      index: 2,
    })
    expect(dropTarget({ id: groupDropId('g2'), data: {} }, groups)).toEqual({
      groupId: 'g2',
      index: 0,
    })
  })

  it('resolves nothing without a drop target or usable row data', () => {
    expect(dropTarget(null, groups)).toBeNull()
    expect(dropTarget({ id: 'stray', data: {} }, groups)).toBeNull()
    expect(dropTarget({ id: 'stray', data: { groupId: 'g1' } }, groups)).toBeNull()
  })
})
