import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGroup, createLayer, emptyDoc } from '@/core/model/defaults'
import type { IconDoc } from '@/core/model/types'
import type { RenderOptions } from '@/core/render'
import { useEditor } from '@/state'
import { CanvasPane } from './CanvasPane'
import { getActiveRenderer } from './rendererRef'

const fake = vi.hoisted(() => {
  const renders: Array<{ doc: IconDoc; options: RenderOptions }> = []
  return {
    renders,
    renderer: {
      kind: 'gl' as 'gl' | 'flat',
      render: (doc: IconDoc, options: RenderOptions) => {
        renders.push({ doc, options })
      },
      toBlob: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
    },
  }
})

vi.mock('@/core/render', () => ({ createRenderer: () => fake.renderer }))

beforeEach(() => {
  fake.renders.length = 0
  fake.renderer.kind = 'gl'
  fake.renderer.resize.mockClear()
  fake.renderer.dispose.mockClear()
  useEditor.setState({ doc: emptyDoc(), selection: { layerIds: [], groupId: null } })
  useEditor
    .getState()
    .setView({ rendition: 'default', platform: 'ios', wallpaper: 'light', zoom: 0 })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** happy-dom lays nothing out, so the stage is given a 512px box by hand. */
const stubLayout = () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 512,
    bottom: 512,
    width: 512,
    height: 512,
    toJSON: () => ({}),
  })
}

const docWithLayer = () => ({
  ...emptyDoc('Icon'),
  groups: [
    createGroup('Group', [
      createLayer({
        name: 'Shape',
        svg: '<g/>',
        defs: '',
        sourceViewBox: [0, 0, 1024, 1024] as [number, number, number, number],
        bbox: { x: 0, y: 0, width: 200, height: 200 },
      }),
    ]),
  ],
})

describe('CanvasPane', () => {
  it('shows every rendition tab', () => {
    render(<CanvasPane />)
    for (const label of [
      'Default',
      'Dark',
      'Clear Light',
      'Clear Dark',
      'Tinted Light',
      'Tinted Dark',
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeDefined()
    }
  })

  it('abbreviates the long rendition labels but keeps their full names', () => {
    render(<CanvasPane />)
    const tab = screen.getByRole('tab', { name: 'Tinted Dark' })
    expect(tab.textContent).toBe('Tinted D')
    expect(tab.getAttribute('title')).toBe('Tinted Dark')
    // the row wraps rather than clipping its controls when the pane is narrow
    const row = tab.closest('div.flex-wrap')
    expect(row).not.toBeNull()
  })

  it('switches the rendition when a tab is clicked', async () => {
    render(<CanvasPane />)
    await userEvent.click(screen.getByRole('tab', { name: 'Clear Dark' }))
    expect(useEditor.getState().view.rendition).toBe('clearDark')
  })

  it('reveals the tint colour only for the tinted renditions', async () => {
    render(<CanvasPane />)
    expect(screen.queryByLabelText('Tint color')).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Tinted Light' }))
    expect(screen.getByLabelText('Tint color')).toBeDefined()
  })

  it('switches the platform', async () => {
    render(<CanvasPane />)
    await userEvent.click(screen.getByRole('button', { name: 'macOS' }))
    expect(useEditor.getState().view.platform).toBe('macos')
  })

  it('renders the document through the renderer and releases it on unmount', () => {
    const { unmount } = render(<CanvasPane />)
    expect(fake.renders.length).toBeGreaterThan(0)
    expect(fake.renders[0]?.options.rendition).toBe('default')
    expect(fake.renderer.resize).toHaveBeenCalled()
    expect(getActiveRenderer()).toBe(fake.renderer)
    unmount()
    expect(fake.renderer.dispose).toHaveBeenCalled()
    expect(getActiveRenderer()).toBeNull()
  })

  it('re-renders when the view changes', async () => {
    render(<CanvasPane />)
    const before = fake.renders.length
    await userEvent.click(screen.getByRole('tab', { name: 'Dark' }))
    expect(fake.renders.length).toBeGreaterThan(before)
    expect(fake.renders.at(-1)?.options.rendition).toBe('dark')
  })

  it('invites an import while the document is empty', () => {
    render(<CanvasPane />)
    expect(screen.getByText('Import SVG files to start')).toBeDefined()
  })

  it('labels the preview as approximate, or flat without WebGL', () => {
    render(<CanvasPane />)
    expect(screen.getByRole('button', { name: 'Approximate preview' })).toBeDefined()
    cleanup()
    fake.renderer.kind = 'flat'
    render(<CanvasPane />)
    expect(screen.getByRole('button', { name: 'Flat preview (WebGL unavailable)' })).toBeDefined()
  })

  it('selects a layer, drags it, and records the drag as one undo step', () => {
    stubLayout()
    useEditor.setState({ doc: docWithLayer() })
    render(<CanvasPane />)
    const stage = screen.getByLabelText('Icon canvas')

    // 512 CSS px stands in for the 1024pt canvas, so client px double into points.
    fireEvent.pointerDown(stage, { clientX: 50, clientY: 50, pointerId: 1, button: 0 })
    const layerId = useEditor.getState().doc.groups[0]?.layers[0]?.id
    expect(useEditor.getState().selection.layerIds).toEqual([layerId])

    fireEvent.pointerMove(stage, { clientX: 100, clientY: 125, pointerId: 1 })
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 150, clientY: 150, pointerId: 1 })

    const moved = useEditor.getState().doc.groups[0]?.layers[0]?.transform
    expect(moved).toMatchObject({ x: 200, y: 200 })

    useEditor.getState().undo()
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform).toMatchObject({ x: 0, y: 0 })
  })

  it('resizes once per size change, not once per document change', () => {
    stubLayout()
    useEditor.setState({ doc: docWithLayer() })
    render(<CanvasPane />)
    const stage = screen.getByLabelText('Icon canvas')
    const resizes = fake.renderer.resize.mock.calls.length
    const renders = fake.renders.length

    // Three document changes in one drag: press, two moves.
    fireEvent.pointerDown(stage, { clientX: 50, clientY: 50, pointerId: 1, button: 0 })
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(stage, { clientX: 150, clientY: 150, pointerId: 1 })

    expect(fake.renderer.resize.mock.calls.length).toBe(resizes)
    expect(fake.renders.length).toBe(renders + 2)
  })

  it('ends an in-flight gesture when the pane unmounts', () => {
    stubLayout()
    useEditor.setState({ doc: docWithLayer() })
    const { unmount } = render(<CanvasPane />)
    const stage = screen.getByLabelText('Icon canvas')
    fireEvent.pointerDown(stage, { clientX: 50, clientY: 50, pointerId: 1, button: 0 })
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 150, pointerId: 1 })
    unmount()

    // History is only tracking again — so undoable — once the gesture has ended.
    expect(useEditor.getState().canUndo()).toBe(true)
    useEditor.getState().undo()
    expect(useEditor.getState().doc.groups[0]?.layers[0]?.transform).toMatchObject({ x: 0, y: 0 })
  })

  it('clips the selection chrome to the stage', () => {
    stubLayout()
    useEditor.setState({ doc: docWithLayer() })
    render(<CanvasPane />)
    const stage = screen.getByLabelText('Icon canvas')
    const overlay = stage.querySelector('svg') as SVGElement
    const classes = overlay.getAttribute('class') ?? ''
    expect(classes).toContain('overflow-hidden')
    expect(classes).not.toContain('overflow-visible')
    // the overlay covers the stage exactly, in the renderer's own coordinates
    expect(classes).toContain('inset-0')
    expect(overlay.getAttribute('viewBox')).toBe('0 0 1024 1024')
  })

  it('clears the selection when the pointer lands on the pane gutter', () => {
    stubLayout()
    useEditor.setState({ doc: docWithLayer() })
    render(<CanvasPane />)
    const stage = screen.getByLabelText('Icon canvas')
    fireEvent.pointerDown(stage, { clientX: 50, clientY: 50, pointerId: 1, button: 0 })
    fireEvent.pointerUp(stage, { clientX: 50, clientY: 50, pointerId: 1 })
    expect(useEditor.getState().selection.layerIds).toHaveLength(1)

    const gutter = stage.parentElement as HTMLElement
    fireEvent.pointerDown(gutter, { pointerId: 2, button: 0 })
    expect(useEditor.getState().selection.layerIds).toEqual([])
  })

  it('clears the selection when the pointer lands on empty canvas', () => {
    stubLayout()
    useEditor.setState({ doc: docWithLayer() })
    render(<CanvasPane />)
    const stage = screen.getByLabelText('Icon canvas')
    fireEvent.pointerDown(stage, { clientX: 50, clientY: 50, pointerId: 1, button: 0 })
    expect(useEditor.getState().selection.layerIds).toHaveLength(1)
    fireEvent.pointerUp(stage, { clientX: 50, clientY: 50, pointerId: 1 })
    fireEvent.pointerDown(stage, { clientX: 400, clientY: 400, pointerId: 1, button: 0 })
    expect(useEditor.getState().selection.layerIds).toEqual([])
  })
})
