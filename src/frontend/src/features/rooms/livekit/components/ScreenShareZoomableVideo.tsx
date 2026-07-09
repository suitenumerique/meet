import { css } from '@/styled-system/css'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenShareZoom } from '../hooks/useScreenShareZoom'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { ScreenShareZoomControls } from './ScreenShareZoomControls'

interface ScreenShareZoomableVideoProps {
  tileRef: React.RefObject<HTMLDivElement | null>
  children: ReactNode
}

// The video comes in as children so that a zoom change, which only re-renders
// this wrapper, leaves the video subtree untouched.
export const ScreenShareZoomableVideo = ({
  tileRef,
  children,
}: ScreenShareZoomableVideoProps) => {
  const zoom = useScreenShareZoom()
  const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
  const announce = useScreenReaderAnnounce()

  // Single SR announcement per zoom change (buttons only expose the action label).
  const prevZoomRef = useRef(zoom.zoomPercentage)
  const hasAnnouncedPanHint = useRef(false)
  useEffect(() => {
    if (prevZoomRef.current === zoom.zoomPercentage) return
    const wasAtDefault = prevZoomRef.current <= 100
    prevZoomRef.current = zoom.zoomPercentage

    if (wasAtDefault && zoom.isZoomed && !hasAnnouncedPanHint.current) {
      hasAnnouncedPanHint.current = true
      announce(t('panHint', { level: zoom.zoomPercentage }), 'polite')
    } else {
      announce(t('currentZoomLevel', { level: zoom.zoomPercentage }), 'polite')
    }

    if (!zoom.isZoomed) hasAnnouncedPanHint.current = false
  }, [zoom.zoomPercentage, zoom.isZoomed, announce, t])

  // Attach keyboard listener on the tile container (has tabIndex=0).
  useEffect(() => {
    const el = tileRef.current
    if (!el) return
    el.addEventListener('keydown', zoom.handleKeyDown)
    return () => el.removeEventListener('keydown', zoom.handleKeyDown)
  }, [tileRef, zoom.handleKeyDown])

  // Native wheel listener so we can use { passive: false } and preventDefault.
  // React onWheel is passive — Ctrl+scroll would zoom the whole browser page.
  const zoomSurfaceRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = zoomSurfaceRef.current
    if (!el) return
    el.addEventListener('wheel', zoom.handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', zoom.handleWheel)
  }, [zoom.handleWheel])

  let panCursor: React.CSSProperties['cursor'] = 'default'
  if (zoom.isZoomed) {
    panCursor = zoom.isDragging ? 'grabbing' : 'grab'
  }

  return (
    <>
      {/* Pan/zoom surface - Ctrl+wheel to zoom, drag when zoomed. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        ref={zoomSurfaceRef}
        className={css({
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          userSelect: 'none',
        })}
        style={{
          cursor: panCursor,
        }}
        onMouseDown={zoom.handlePanStart}
        onMouseMove={zoom.handlePanMove}
        onMouseUp={zoom.handlePanEnd}
        onMouseLeave={zoom.handlePanEnd}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            transform: `scale(${zoom.zoomLevel}) translate(${zoom.panOffset.x}%, ${zoom.panOffset.y}%)`,
            transformOrigin: 'center center',
            transition: zoom.isDragging ? 'none' : 'transform 150ms ease-out',
          }}
        >
          {children}
        </div>
      </div>
      <ScreenShareZoomControls
        containerRef={tileRef}
        isZoomed={zoom.isZoomed}
        zoomPercentage={zoom.zoomPercentage}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onResetZoom={zoom.resetZoom}
      />
    </>
  )
}
