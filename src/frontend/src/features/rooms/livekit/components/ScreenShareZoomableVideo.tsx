import { css } from '@/styled-system/css'
import { type TrackReference } from '@livekit/components-core'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenShareZoom } from '../hooks/useScreenShareZoom'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { ScreenShareZoomControls } from './ScreenShareZoomControls'
import { ScreenShareVideoTrack } from './ScreenShareVideoTrack'

interface ScreenShareZoomableVideoProps {
  trackRef: TrackReference
  tileRef: React.RefObject<HTMLDivElement | null>
  onSubscriptionStatusChanged: (subscribed: boolean) => void
  manageSubscription?: boolean
}

export const ScreenShareZoomableVideo = ({
  trackRef,
  tileRef,
  onSubscriptionStatusChanged,
  manageSubscription,
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

  let panCursor: React.CSSProperties['cursor'] = 'default'
  if (zoom.isZoomed) {
    panCursor = zoom.isDragging ? 'grabbing' : 'grab'
  }

  return (
    <>
      {/* Pan/zoom surface - Ctrl+wheel to zoom, drag when zoomed. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
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
        onWheel={zoom.handleWheel}
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
          <ScreenShareVideoTrack
            trackRef={trackRef}
            onSubscriptionStatusChanged={onSubscriptionStatusChanged}
            manageSubscription={manageSubscription}
          />
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
