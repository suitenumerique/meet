import { useCallback, useRef, useSyncExternalStore } from 'react'
import { useMove } from 'react-aria'
import type { MoveMoveEvent } from '@react-types/shared'
import {
  MIN_ZOOM,
  PAN_STEP,
  WHEEL_ZOOM_SPEED,
  ZOOM_STEP,
  type PanOffset,
  type ZoomSnapshot,
  buildZoomSnapshot,
  clampPan,
  clampZoom,
  getCursorFromZoomState,
  getCursorPercentsFromWheelEvent,
  getPanDeltaPercentsFromMove,
  getWheelPanOffset,
  getZoomTransform,
} from '../utils/screenShareZoom'

/**
 * Manages zoom and pan state for a remote screen share.
 *
 * Performance: zoom/pan live in refs and are applied imperatively to the DOM
 * (via transformElRef / surfaceElRef) so the hot path (drag, wheel) never
 * triggers a React re-render. A useSyncExternalStore snapshot is flushed only
 * when the toolbar UI needs to update (zoom level change, drag end).
 *
 * Drag/touch panning is handled by react-aria's useMove (moveProps).
 * Ctrl/Cmd + wheel zoom is a native listener (must be non-passive to
 * preventDefault and block browser page zoom).
 * Arrow key panning and +/-/0 zoom are on a keydown listener attached to the
 * tile container (which has tabIndex=0 and focus).
 */
export const useScreenShareZoom = () => {
  const zoomRef = useRef(MIN_ZOOM)
  const panRef = useRef<PanOffset>({ x: 0, y: 0 })
  const draggingRef = useRef(false)

  // The consumer binds these to the inner transform div and the outer drag surface.
  const transformElRef = useRef<HTMLDivElement | null>(null)
  const surfaceElRef = useRef<HTMLDivElement | null>(null)

  // Snapshot store: subscribers are notified only on explicit flush() calls.
  const snapshotRef = useRef<ZoomSnapshot>(
    buildZoomSnapshot(MIN_ZOOM, { x: 0, y: 0 }, false)
  )
  const listenersRef = useRef(new Set<() => void>())

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb)
    return () => {
      listenersRef.current.delete(cb)
    }
  }, [])

  const getSnapshot = useCallback(() => snapshotRef.current, [])

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const flush = useCallback(() => {
    snapshotRef.current = buildZoomSnapshot(
      zoomRef.current,
      panRef.current,
      draggingRef.current
    )
    listenersRef.current.forEach((cb) => cb())
  }, [])

  const applyTransform = useCallback((transition: boolean) => {
    const el = transformElRef.current
    if (!el) return
    el.style.transform = getZoomTransform(zoomRef.current, panRef.current)
    el.style.transition = transition ? 'transform 150ms ease-out' : 'none'
  }, [])

  const applyCursor = useCallback(() => {
    const el = surfaceElRef.current
    if (!el) return
    el.style.cursor = getCursorFromZoomState(
      zoomRef.current,
      draggingRef.current
    )
  }, [])

  const zoomIn = useCallback(() => {
    const next = clampZoom(zoomRef.current + ZOOM_STEP)
    zoomRef.current = next
    panRef.current = clampPan(panRef.current, next)
    applyTransform(true)
    applyCursor()
    flush()
  }, [applyTransform, applyCursor, flush])

  const zoomOut = useCallback(() => {
    const next = clampZoom(zoomRef.current - ZOOM_STEP)
    zoomRef.current = next
    panRef.current =
      next <= MIN_ZOOM ? { x: 0, y: 0 } : clampPan(panRef.current, next)
    applyTransform(true)
    applyCursor()
    flush()
  }, [applyTransform, applyCursor, flush])

  const resetZoom = useCallback(() => {
    zoomRef.current = MIN_ZOOM
    panRef.current = { x: 0, y: 0 }
    applyTransform(true)
    applyCursor()
    flush()
  }, [applyTransform, applyCursor, flush])

  // Must be attached with { passive: false } so preventDefault() blocks
  // the browser's native Ctrl+scroll page zoom.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return

      e.preventDefault()
      e.stopPropagation()

      const target = e.currentTarget as HTMLElement
      const prev = zoomRef.current
      const delta = -e.deltaY * WHEEL_ZOOM_SPEED
      const next = clampZoom(prev + delta)

      if (next <= MIN_ZOOM) {
        zoomRef.current = MIN_ZOOM
        panRef.current = { x: 0, y: 0 }
      } else {
        const { cursorXPercent, cursorYPercent } =
          getCursorPercentsFromWheelEvent(e, target)
        zoomRef.current = next
        panRef.current = getWheelPanOffset({
          pan: panRef.current,
          prevZoom: prev,
          nextZoom: next,
          cursorXPercent,
          cursorYPercent,
        })
      }

      applyTransform(false)
      applyCursor()
      flush()
    },
    [applyTransform, applyCursor, flush]
  )

  // useMove handles mouse drag + touch pan. Keyboard arrows are not handled
  // here because moveProps is on the zoom surface, while focus is on the tile
  // container, see handleKeyDown below.
  const { moveProps } = useMove({
    onMoveStart() {
      if (zoomRef.current <= MIN_ZOOM) return
      draggingRef.current = true
      applyCursor()
      flush()
    },
    onMove(e: MoveMoveEvent) {
      if (zoomRef.current <= MIN_ZOOM) return

      const el = surfaceElRef.current
      if (!el) return

      const { deltaXPercent, deltaYPercent } = getPanDeltaPercentsFromMove(
        e.deltaX,
        e.deltaY,
        el
      )

      panRef.current = clampPan(
        {
          x: panRef.current.x + deltaXPercent,
          y: panRef.current.y + deltaYPercent,
        },
        zoomRef.current
      )

      applyTransform(false)
      // Mouse drag: skip flush (imperative-only) to avoid re-renders per frame.
      // Keyboard: flush so the toolbar reflects the updated position.
      if (e.pointerType === 'keyboard') {
        flush()
      }
    },
    onMoveEnd() {
      draggingRef.current = false
      applyTransform(true)
      applyCursor()
      flush()
    },
  })

  const panBy = useCallback(
    (dx: number, dy: number) => {
      panRef.current = clampPan(
        { x: panRef.current.x + dx, y: panRef.current.y + dy },
        zoomRef.current
      )
      applyTransform(true)
      flush()
    },
    [applyTransform, flush]
  )

  // Attached to the tile container (not the zoom surface) where keyboard
  // focus lives. Arrows pan, +/-/0 zoom.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isZoomed = zoomRef.current > MIN_ZOOM
      if (!isZoomed && e.key !== '+' && e.key !== '=') return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          panBy(PAN_STEP, 0)
          break
        case 'ArrowRight':
          e.preventDefault()
          panBy(-PAN_STEP, 0)
          break
        case 'ArrowUp':
          e.preventDefault()
          panBy(0, PAN_STEP)
          break
        case 'ArrowDown':
          e.preventDefault()
          panBy(0, -PAN_STEP)
          break
        case '+':
        case '=':
          e.preventDefault()
          zoomIn()
          break
        case '-':
          e.preventDefault()
          zoomOut()
          break
        case '0':
          e.preventDefault()
          resetZoom()
          break
      }
    },
    [panBy, zoomIn, zoomOut, resetZoom]
  )

  return {
    ...snapshot,
    transformElRef,
    surfaceElRef,
    moveProps,
    zoomIn,
    zoomOut,
    resetZoom,
    handleWheel,
    handleKeyDown,
  }
}
