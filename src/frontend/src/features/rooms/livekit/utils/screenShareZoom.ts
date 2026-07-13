export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
export const ZOOM_STEP = 0.1
export const WHEEL_ZOOM_SPEED = 0.002
export const WHEEL_ZOOM_FOCUS_BLEND = 0.3
export const PAN_STEP = 5
export const PAN_CLAMP_HALF = 50

export interface PanOffset {
  x: number
  y: number
}

export interface ZoomSnapshot {
  zoomLevel: number
  zoomPercentage: number
  panOffset: PanOffset
  isZoomed: boolean
  isDragging: boolean
  canZoomIn: boolean
  canZoomOut: boolean
}

export const clampZoom = (value: number) => {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value))
}

// Restrict pan so the content edge never passes the viewport center.
export const clampPan = (pan: PanOffset, zoom: number): PanOffset => {
  const maxPan = ((zoom - 1) / zoom) * PAN_CLAMP_HALF
  return {
    x: Math.max(-maxPan, Math.min(maxPan, pan.x)),
    y: Math.max(-maxPan, Math.min(maxPan, pan.y)),
  }
}

export const buildZoomSnapshot = (
  zoom: number,
  pan: PanOffset,
  dragging: boolean
): ZoomSnapshot => {
  return {
    zoomLevel: zoom,
    zoomPercentage: Math.round(zoom * 100),
    panOffset: pan,
    isZoomed: zoom > MIN_ZOOM,
    isDragging: dragging,
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
  }
}

export const getZoomTransform = (zoom: number, pan: PanOffset) => {
  return `scale(${zoom}) translate(${pan.x}%, ${pan.y}%)`
}

export const getCursorFromZoomState = (zoom: number, dragging: boolean) => {
  if (zoom <= MIN_ZOOM) return 'default'
  return dragging ? 'grabbing' : 'grab'
}

// Blend the current pan toward the cursor position so the zoom "tracks" the pointer.
export const getWheelPanOffset = ({
  pan,
  prevZoom,
  nextZoom,
  cursorXPercent,
  cursorYPercent,
}: {
  pan: PanOffset
  prevZoom: number
  nextZoom: number
  cursorXPercent: number
  cursorYPercent: number
}): PanOffset => {
  const zoomRatio = nextZoom / prevZoom
  return clampPan(
    {
      x:
        pan.x +
        (cursorXPercent - pan.x) * (1 - 1 / zoomRatio) * WHEEL_ZOOM_FOCUS_BLEND,
      y:
        pan.y +
        (cursorYPercent - pan.y) * (1 - 1 / zoomRatio) * WHEEL_ZOOM_FOCUS_BLEND,
    },
    nextZoom
  )
}

// Convert cursor pixel position to a % offset from the surface center.
export const getCursorPercentsFromWheelEvent = (
  e: WheelEvent,
  target: HTMLElement
) => {
  const rect = target.getBoundingClientRect()
  return {
    cursorXPercent:
      ((e.clientX - rect.left) / rect.width) * 100 - PAN_CLAMP_HALF,
    cursorYPercent:
      ((e.clientY - rect.top) / rect.height) * 100 - PAN_CLAMP_HALF,
  }
}

// Convert useMove pixel deltas to % of the surface dimensions.
export const getPanDeltaPercentsFromMove = (
  deltaX: number,
  deltaY: number,
  surface: HTMLElement
) => {
  const rect = surface.getBoundingClientRect()
  return {
    deltaXPercent: (deltaX / rect.width) * 100,
    deltaYPercent: (deltaY / rect.height) * 100,
  }
}
