export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
export const ZOOM_STEP = 0.1
export const WHEEL_ZOOM_SPEED = 0.002
export const PAN_STEP = 5
export const PAN_CLAMP_HALF = 50

export interface PanOffset {
  x: number
  y: number
}

// Fraction of the surface each axis of the picture covers, in [0, 1].
export interface PictureRatio {
  x: number
  y: number
}

export const FULL_PICTURE_RATIO: PictureRatio = { x: 1, y: 1 }

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

// Restrict pan so the picture always covers the view. Pan is a % of the
// surface, in which object-fit: contain letterboxes the picture: its half
// extent is `ratio * 50` against a view half extent of 50, and scaling by
// `zoom` must keep `zoom * (ratio * 50 - |pan|) >= 50`. An axis whose picture
// is still smaller than the view is pinned to 0, keeping the bars symmetric.
export const clampPan = (
  pan: PanOffset,
  zoom: number,
  ratio: PictureRatio
): PanOffset => {
  const maxPanX = Math.max(0, (ratio.x - 1 / zoom) * PAN_CLAMP_HALF)
  const maxPanY = Math.max(0, (ratio.y - 1 / zoom) * PAN_CLAMP_HALF)
  return {
    x: Math.max(-maxPanX, Math.min(maxPanX, pan.x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, pan.y)),
  }
}

// Per-axis fraction of the surface covered by an object-fit: contain picture.
export const getPictureRatio = (
  surfaceWidth: number,
  surfaceHeight: number,
  videoWidth: number,
  videoHeight: number
): PictureRatio => {
  if (!surfaceWidth || !surfaceHeight || !videoWidth || !videoHeight) {
    return FULL_PICTURE_RATIO
  }
  const surfaceRatio = surfaceWidth / surfaceHeight
  const videoRatio = videoWidth / videoHeight
  return surfaceRatio > videoRatio
    ? { x: videoRatio / surfaceRatio, y: 1 }
    : { x: 1, y: surfaceRatio / videoRatio }
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

// Keep the content point under the cursor anchored while zooming. With
// `scale(z) translate(pan%)`, a point at `offset` from the center renders at
// `z * (offset + pan)`, so holding it still gives:
// pan' = pan + cursor * (1 / zoom' - 1 / zoom).
export const getWheelPanOffset = ({
  pan,
  prevZoom,
  nextZoom,
  cursorXPercent,
  cursorYPercent,
  ratio,
}: {
  pan: PanOffset
  prevZoom: number
  nextZoom: number
  cursorXPercent: number
  cursorYPercent: number
  ratio: PictureRatio
}): PanOffset => {
  const panShift = 1 / nextZoom - 1 / prevZoom
  return clampPan(
    {
      x: pan.x + cursorXPercent * panShift,
      y: pan.y + cursorYPercent * panShift,
    },
    nextZoom,
    ratio
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
