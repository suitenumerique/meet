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

  // SR announcement: announce zoom level on change, with a one-time pan hint
  // on the first zoom above 100 % per session.
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

  // Native wheel listener with { passive: false } so preventDefault works.
  useEffect(() => {
    const el = zoom.surfaceElRef.current
    if (!el) return
    el.addEventListener('wheel', zoom.handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', zoom.handleWheel)
  }, [zoom.handleWheel, zoom.surfaceElRef])

  return (
    <>
      <div
        ref={zoom.surfaceElRef}
        className={css({
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          userSelect: 'none',
          touchAction: 'none',
        })}
        {...zoom.moveProps}
      >
        <div
          ref={zoom.transformElRef}
          style={{
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            transformOrigin: 'center center',
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
