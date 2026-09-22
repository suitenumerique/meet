import { useCallback, useRef, useState } from 'react'
import { useMove } from 'react-aria'
import type { MoveMoveEvent } from '@react-types/shared'
import {
  FULL_PICTURE_RATIO,
  MAX_ZOOM,
  MIN_ZOOM,
  PAN_STEP,
  WHEEL_ZOOM_SPEED,
  ZOOM_STEP,
  type PanOffset,
  clampPan,
  clampZoom,
  getCursorFromZoomState,
  getCursorPercentsFromWheelEvent,
  getPanDeltaPercentsFromMove,
  getPictureRatio,
  getWheelPanOffset,
  getZoomTransform,
} from '../utils/screenShareZoom'

/**
 * Manages zoom and pan state for a remote screen share.
 *
 * Performance: zoom/pan live in refs and are applied imperatively to the DOM
 * (via transformElRef / surfaceElRef) so dragging and panning never re-render.
 * React state only tracks what the toolbar displays, and only updates when
 * the zoom level actually changes.
 *
 * Drag/touch panning is handled by react-aria's useMove (moveProps).
 * The wheel listener (non-passive) zooms on Ctrl/Cmd+scroll and pans on a
 * two-finger trackpad scroll once zoomed.
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

  // Mirrors zoomRef for the toolbar. Panning never publishes: the toolbar
  // shows the zoom level, not the position.
  const [zoomLevel, setZoomLevel] = useState(MIN_ZOOM)

  const syncToolbar = useCallback(() => setZoomLevel(zoomRef.current), [])

  const applyTransform = useCallback(() => {
    const el = transformElRef.current
    if (!el) return
    el.style.transform = getZoomTransform(zoomRef.current, panRef.current)
  }, [])

  // The video is letterboxed inside the surface by object-fit: contain, so the
  // pan bounds depend on how much of the surface the picture actually covers.
  // Read live rather than cached: both the tile and the shared resolution can
  // change at any time.
  const readPictureRatio = useCallback(() => {
    const surface = surfaceElRef.current
    const video = transformElRef.current?.querySelector('video')
    if (!surface || !video) return FULL_PICTURE_RATIO
    return getPictureRatio(
      surface.clientWidth,
      surface.clientHeight,
      video.videoWidth,
      video.videoHeight
    )
  }, [])

  const applyCursor = useCallback(() => {
    const el = surfaceElRef.current
    if (!el) return
    el.style.cursor = getCursorFromZoomState(
      zoomRef.current,
      draggingRef.current
    )
  }, [])

  const setZoom = useCallback(
    (next: number) => {
      zoomRef.current = next
      panRef.current =
        next <= MIN_ZOOM
          ? { x: 0, y: 0 }
          : clampPan(panRef.current, next, readPictureRatio())
      applyTransform()
      applyCursor()
      syncToolbar()
    },
    [applyTransform, applyCursor, syncToolbar, readPictureRatio]
  )

  const zoomIn = useCallback(
    () => setZoom(clampZoom(zoomRef.current + ZOOM_STEP)),
    [setZoom]
  )

  const zoomOut = useCallback(
    () => setZoom(clampZoom(zoomRef.current - ZOOM_STEP)),
    [setZoom]
  )

  const resetZoom = useCallback(() => setZoom(MIN_ZOOM), [setZoom])

  // Must be attached with { passive: false } so preventDefault() blocks
  // the browser's native Ctrl+scroll page zoom. Trackpad pinch arrives
  // here as a wheel event with ctrl/cmd already set.
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
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
            ratio: readPictureRatio(),
          })
        }

        applyTransform()
        applyCursor()
        syncToolbar()
        return
      }

      // Two-finger trackpad scroll: pan only once zoomed, otherwise leave
      // the event alone so the page can still scroll.
      if (zoomRef.current <= MIN_ZOOM) return

      const el = surfaceElRef.current
      if (!el) return

      e.preventDefault()
      e.stopPropagation()

      const { deltaXPercent, deltaYPercent } = getPanDeltaPercentsFromMove(
        -e.deltaX,
        -e.deltaY,
        el
      )
      panRef.current = clampPan(
        {
          x: panRef.current.x + deltaXPercent,
          y: panRef.current.y + deltaYPercent,
        },
        zoomRef.current,
        readPictureRatio()
      )
      applyTransform()
    },
    [applyTransform, applyCursor, syncToolbar, readPictureRatio]
  )

  // useMove handles mouse drag + touch pan. Keyboard arrows are not handled
  // here because moveProps is on the zoom surface, while focus is on the tile
  // container, see handleKeyDown below.
  const { moveProps } = useMove({
    onMoveStart() {
      if (zoomRef.current <= MIN_ZOOM) return
      draggingRef.current = true
      applyCursor()
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
        zoomRef.current,
        readPictureRatio()
      )

      applyTransform()
    },
    onMoveEnd() {
      draggingRef.current = false
      applyTransform()
      applyCursor()
    },
  })

  const panBy = useCallback(
    (dx: number, dy: number) => {
      panRef.current = clampPan(
        { x: panRef.current.x + dx, y: panRef.current.y + dy },
        zoomRef.current,
        readPictureRatio()
      )
      applyTransform()
    },
    [applyTransform, readPictureRatio]
  )

  // Attached to the tile container (not the zoom surface) where keyboard
  // focus lives. Arrows pan, +/-/0 zoom.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isZoomed = zoomRef.current > MIN_ZOOM
      if (!isZoomed && e.key !== '+' && e.key !== '=') return

      if (e.key.startsWith('Arrow') && e.target !== e.currentTarget) return

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
    zoomPercentage: Math.round(zoomLevel * 100),
    isZoomed: zoomLevel > MIN_ZOOM,
    canZoomIn: zoomLevel < MAX_ZOOM,
    canZoomOut: zoomLevel > MIN_ZOOM,
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
