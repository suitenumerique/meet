import { useCallback, useRef, useState } from 'react'

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.1
const WHEEL_ZOOM_SPEED = 0.002
const WHEEL_ZOOM_FOCUS_BLEND = 0.3
const PAN_STEP = 5
const PAN_CLAMP_HALF = 50

interface PanOffset {
  x: number
  y: number
}

export function useScreenShareZoom() {
  const [zoomLevel, setZoomLevel] = useState(MIN_ZOOM)
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  // Ref for event handlers; state drives cursor re-renders during drag.
  const isDraggingRef = useRef(false)
  const dragStart = useRef<PanOffset>({ x: 0, y: 0 })
  const panStart = useRef<PanOffset>({ x: 0, y: 0 })

  const isZoomed = zoomLevel > MIN_ZOOM
  const canZoomIn = zoomLevel < MAX_ZOOM
  const canZoomOut = zoomLevel > MIN_ZOOM

  const clampPan = useCallback(
    (pan: PanOffset, zoom: number): PanOffset => {
      // Max pan in %, keeps content within the visible area at a given zoom level.
      const maxPan = ((zoom - 1) / zoom) * PAN_CLAMP_HALF
      return {
        x: Math.max(-maxPan, Math.min(maxPan, pan.x)),
        y: Math.max(-maxPan, Math.min(maxPan, pan.y)),
      }
    },
    []
  )

  const clampZoom = useCallback((value: number) => {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
  }, [])

  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => {
      const next = clampZoom(prev + ZOOM_STEP)
      setPanOffset((pan) => clampPan(pan, next))
      return next
    })
  }, [clampZoom, clampPan])

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = clampZoom(prev - ZOOM_STEP)
      if (next <= MIN_ZOOM) {
        setPanOffset({ x: 0, y: 0 })
        return MIN_ZOOM
      }
      setPanOffset((pan) => clampPan(pan, next))
      return next
    })
  }, [clampZoom, clampPan])

  const resetZoom = useCallback(() => {
    setZoomLevel(MIN_ZOOM)
    setPanOffset({ x: 0, y: 0 })
  }, [])

  // Arrow key panning (keyboard a11y).
  const panBy = useCallback(
    (dx: number, dy: number) => {
      setPanOffset((pan) =>
        clampPan({ x: pan.x + dx, y: pan.y + dy }, zoomLevel)
      )
    },
    [zoomLevel, clampPan]
  )

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return

      e.preventDefault()
      e.stopPropagation()

      const target = e.currentTarget as HTMLElement
      const delta = -e.deltaY * WHEEL_ZOOM_SPEED
      const rect = target.getBoundingClientRect()
      const cursorXPercent =
        ((e.clientX - rect.left) / rect.width) * 100 - PAN_CLAMP_HALF
      const cursorYPercent =
        ((e.clientY - rect.top) / rect.height) * 100 - PAN_CLAMP_HALF

      setZoomLevel((prev) => {
        const next = clampZoom(prev + delta)

        if (next <= MIN_ZOOM) {
          setPanOffset({ x: 0, y: 0 })
          return MIN_ZOOM
        }

        setPanOffset((pan) => {
          const zoomRatio = next / prev
          return clampPan(
            {
              x:
                pan.x +
                (cursorXPercent - pan.x) *
                  (1 - 1 / zoomRatio) *
                  WHEEL_ZOOM_FOCUS_BLEND,
              y:
                pan.y +
                (cursorYPercent - pan.y) *
                  (1 - 1 / zoomRatio) *
                  WHEEL_ZOOM_FOCUS_BLEND,
            },
            next
          )
        })

        return next
      })
    },
    [clampZoom, clampPan]
  )

  const handlePanStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isZoomed) return

      e.preventDefault()
      isDraggingRef.current = true
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      panStart.current = { ...panOffset }
    },
    [isZoomed, panOffset]
  )

  const handlePanMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return

      const rect = e.currentTarget.getBoundingClientRect()
      const deltaXPercent =
        ((e.clientX - dragStart.current.x) / rect.width) * 100
      const deltaYPercent =
        ((e.clientY - dragStart.current.y) / rect.height) * 100

      setPanOffset(
        clampPan(
          {
            x: panStart.current.x + deltaXPercent,
            y: panStart.current.y + deltaYPercent,
          },
          zoomLevel
        )
      )
    },
    [zoomLevel, clampPan]
  )

  const handlePanEnd = useCallback(() => {
    isDraggingRef.current = false
    setIsDragging(false)
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
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
    [isZoomed, panBy, zoomIn, zoomOut, resetZoom]
  )

  return {
    zoomLevel,
    zoomPercentage: Math.round(zoomLevel * 100),
    panOffset,
    isZoomed,
    isDragging,
    canZoomIn,
    canZoomOut,
    zoomIn,
    zoomOut,
    resetZoom,
    panBy,
    handleWheel,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    handleKeyDown,
  }
}
