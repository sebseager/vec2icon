/** The canvas pane: renderer output, selection chrome and the transform gestures. */

import { FileUp } from 'lucide-react'
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { layerCanvasBBox } from '@/core/model/geometry'
import type { BBox, IconDoc, Layer, Transform } from '@/core/model/types'
import { CANVAS_SIZE } from '@/core/model/types'
import { createRenderer, type Renderer } from '@/core/render'
import { safeArea } from '@/core/render/shapes'
import { useEditor } from '@/state'
import { openImportPicker } from '../lib/importPicker'
import { loadExample } from '../lib/loadExample'
import { CanvasToolbar } from './CanvasToolbar'
import { type Point, unionBBox } from './lib/bbox'
import { type Frame, layerFrame } from './lib/frame'
import { rotateResult, scaleResult } from './lib/gestures'
import { type HandleId, handleCursor, hitHandle } from './lib/handles'
import { hitTest } from './lib/hitTest'
import { capturePointer, releasePointer } from './lib/pointerCapture'
import { renderOptionsFromView } from './lib/renderOptions'
import { type Delta, snapMove } from './lib/snap'
import { nextZoom, stageSize, toCanvasPoint } from './lib/viewport'
import { setActiveRenderer } from './rendererRef'
import { SelectionOverlay } from './SelectionOverlay'

type Drag =
  | {
      kind: 'move'
      layerIds: string[]
      startBox: BBox
      startPointer: Point
      applied: Delta
    }
  | {
      kind: 'scale'
      layerId: string
      pivot: Point
      startPointer: Point
      startTransform: Transform
    }
  | { kind: 'rotate'; layerId: string; pivot: Point; startPointer: Point; startRotation: number }

const layersById = (doc: IconDoc, ids: readonly string[]): Layer[] => {
  const wanted = new Set(ids)
  const out: Layer[] = []
  for (const group of doc.groups) {
    for (const layer of group.layers) {
      if (wanted.has(layer.id)) out.push(layer)
    }
  }
  return out
}

export const CanvasPane = () => {
  const doc = useEditor((s) => s.doc)
  const view = useEditor((s) => s.view)
  const selectedIds = useEditor((s) => s.selection.layerIds)
  const select = useEditor((s) => s.select)
  const clearSelection = useEditor((s) => s.clearSelection)
  const setTransform = useEditor((s) => s.setTransform)
  const nudgeLayers = useEditor((s) => s.nudgeLayers)
  const beginGesture = useEditor((s) => s.beginGesture)
  const endGesture = useEditor((s) => s.endGesture)
  const setView = useEditor((s) => s.setView)

  const areaRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderer = useRef<Renderer | null>(null)
  const drag = useRef<Drag | null>(null)

  const [rendererKind, setRendererKind] = useState<Renderer['kind'] | null>(null)
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [cursor, setCursor] = useState('default')

  const size = stageSize(area.width, area.height, view.zoom)
  const ptsPerPixel = CANVAS_SIZE / size

  const selectedLayers = useMemo(() => layersById(doc, selectedIds), [doc, selectedIds])
  const selectedFrames = useMemo(
    () => selectedLayers.map((layer) => ({ id: layer.id, frame: layerFrame(layer) })),
    [selectedLayers],
  )
  const hoverFrame = useMemo((): Frame | null => {
    if (hoverId === null || selectedIds.includes(hoverId)) return null
    const layer = layersById(doc, [hoverId])[0]
    return layer ? layerFrame(layer) : null
  }, [doc, hoverId, selectedIds])

  // Own the renderer for the life of the pane; the export dialog borrows it.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let created: Renderer | null = null
    try {
      created = createRenderer(canvas)
    } catch {
      created = null
    }
    renderer.current = created
    setRendererKind(created?.kind ?? null)
    setActiveRenderer(created)
    return () => {
      setActiveRenderer(null)
      renderer.current = null
      created?.dispose()
    }
  }, [])

  // Track the available space; happy-dom and older browsers may have no observer.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setArea({ width: rect.width, height: rect.height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Both renderers repaint the last document from inside `resize`, so resizing is
  // kept out of the draw effect: otherwise every pointermove during a drag would
  // paint twice, the first time with the stale document.
  useEffect(() => {
    renderer.current?.resize(size, size)
  }, [size])

  useEffect(() => {
    renderer.current?.render(doc, renderOptionsFromView(view))
  }, [doc, view])

  // A drag interrupted by unmount would otherwise leave history suspended.
  useEffect(
    () => () => {
      if (drag.current) {
        drag.current = null
        endGesture()
      }
    },
    [endGesture],
  )

  // React attaches wheel passively, so the zoom listener is wired by hand.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setView({ zoom: nextZoom(useEditor.getState().view.zoom, e.deltaY) })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setView])

  const pointAt = useCallback((e: { clientX: number; clientY: number }): Point => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const rect = stage.getBoundingClientRect()
    return toCanvasPoint({ x: e.clientX, y: e.clientY }, rect, rect.width)
  }, [])

  /** The handle under `point`, and the selected layer it belongs to. */
  const handleAt = (point: Point): { layer: Layer; handle: HandleId } | null => {
    for (const { id, frame } of selectedFrames) {
      const handle = hitHandle(frame, point, ptsPerPixel)
      const layer = selectedLayers.find((l) => l.id === id)
      if (handle && layer) return { layer, handle }
    }
    return null
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const point = pointAt(e)

    const onHandle = handleAt(point)
    if (onHandle) {
      const pivot = layerFrame(onHandle.layer).centre
      drag.current =
        onHandle.handle === 'rotate'
          ? {
              kind: 'rotate',
              layerId: onHandle.layer.id,
              pivot,
              startPointer: point,
              startRotation: onHandle.layer.transform.rotation,
            }
          : {
              kind: 'scale',
              layerId: onHandle.layer.id,
              pivot,
              startPointer: point,
              startTransform: onHandle.layer.transform,
            }
      setCursor(handleCursor(onHandle.handle))
      beginGesture()
      capturePointer(e.currentTarget, e.pointerId)
      return
    }

    const hit = hitTest(doc, point)
    if (!hit) {
      clearSelection()
      return
    }

    const additive = e.shiftKey
    const alreadySelected = selectedIds.includes(hit.id)
    const layerIds = alreadySelected
      ? [...selectedIds]
      : additive
        ? [...selectedIds, hit.id]
        : [hit.id]
    if (!alreadySelected) select([hit.id], { additive })

    const startBox = unionBBox(layersById(doc, layerIds).map(layerCanvasBBox))
    if (!startBox) return
    drag.current = {
      kind: 'move',
      layerIds,
      startBox,
      startPointer: point,
      applied: { dx: 0, dy: 0 },
    }
    setCursor('move')
    beginGesture()
    capturePointer(e.currentTarget, e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    const point = pointAt(e)
    const active = drag.current

    if (!active) {
      const onHandle = handleAt(point)
      const hit = onHandle ? null : hitTest(doc, point)
      setHoverId(hit?.id ?? null)
      setCursor(
        onHandle
          ? handleCursor(onHandle.handle)
          : hit && selectedIds.includes(hit.id)
            ? 'move'
            : 'default',
      )
      return
    }

    if (active.kind === 'move') {
      const snapped = snapMove(
        active.startBox,
        { dx: point.x - active.startPointer.x, dy: point.y - active.startPointer.y },
        safeArea(view.platform),
      )
      nudgeLayers(active.layerIds, snapped.dx - active.applied.dx, snapped.dy - active.applied.dy)
      active.applied = snapped
      return
    }

    if (active.kind === 'scale') {
      setTransform(
        active.layerId,
        scaleResult({
          startTransform: active.startTransform,
          pivot: active.pivot,
          startPointer: active.startPointer,
          pointer: point,
          freeAxis: e.shiftKey,
        }),
      )
      return
    }

    setTransform(active.layerId, {
      rotation: rotateResult({
        startRotation: active.startRotation,
        pivot: active.pivot,
        startPointer: active.startPointer,
        pointer: point,
        snap: e.shiftKey,
      }),
    })
  }

  const endDrag = (e: ReactPointerEvent) => {
    if (!drag.current) return
    drag.current = null
    endGesture()
    setCursor('default')
    releasePointer(e.currentTarget, e.pointerId)
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <CanvasToolbar rendererKind={rendererKind} />
      <div
        ref={areaRef}
        // Clicking the gutter around the stage is a click on nothing, same as
        // clicking empty canvas; the stage's own handler stops it getting here.
        onPointerDown={(e) => {
          if (e.target === e.currentTarget && e.button === 0) clearSelection()
        }}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted"
      >
        <div
          ref={stageRef}
          role="application"
          aria-label="Icon canvas"
          className="relative touch-none shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
          style={{ width: size, height: size, cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => {
            if (!drag.current) setHoverId(null)
          }}
        >
          <canvas ref={canvasRef} className="block h-full w-full" />
          <SelectionOverlay
            selected={selectedFrames}
            hover={hoverFrame}
            ptsPerPixel={ptsPerPixel}
          />
        </div>
        {doc.groups.length === 0 && (
          <div className="pointer-events-none absolute flex flex-col items-center gap-1 rounded-xl border bg-background/95 px-8 py-6 text-center shadow-lg shadow-black/10">
            <FileUp
              className="mb-2 size-10 text-muted-foreground/40"
              strokeWidth={1.25}
              aria-hidden="true"
            />
            <p className="text-[14px] text-foreground">
              <Button
                variant="link"
                className="pointer-events-auto h-auto p-0 text-[14px]"
                onClick={openImportPicker}
              >
                Import
              </Button>{' '}
              or drag-and-drop SVG files here to start
            </p>
            <p className="text-muted-foreground">or</p>
            <Button
              variant="link"
              className="pointer-events-auto h-auto p-0 text-[13px]"
              onClick={() => void loadExample(useEditor.getState())}
            >
              Load an example
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
