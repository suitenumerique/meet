import { css } from '@/styled-system/css'
import { type TrackReference } from '@livekit/components-core'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenShareZoom } from '../hooks/useScreenShareZoom'
import { useScreenSharePopout } from '../hooks/useScreenSharePopout'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { ScreenShareZoomControls } from './ScreenShareZoomControls'
import { ScreenShareVideoTrack } from './ScreenShareVideoTrack'
import { ScreenSharePopoutPlaceholder } from './ScreenSharePopoutPlaceholder'
import { ScreenSharePopoutPortal } from './ScreenSharePopoutPortal'

interface ScreenShareZoomableVideoProps {
  trackRef: TrackReference
  tileRef: React.RefObject<HTMLDivElement | null>
  onSubscriptionStatusChanged: (subscribed: boolean) => void
  manageSubscription?: boolean
}

const popoutChromeClassName = css({
  width: '100%',
  height: '100%',
  position: 'relative',
  backgroundColor: 'primaryDark.50',
  outline: 'none',
  _focusVisible: {
    outline: '2px solid',
    outlineColor: 'primary.500',
    outlineOffset: '-2px',
  },
  '& .lk-participant-media-video': {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
})

export const ScreenShareZoomableVideo = ({
  trackRef,
  tileRef,
  onSubscriptionStatusChanged,
  manageSubscription,
}: ScreenShareZoomableVideoProps) => {
  const zoom = useScreenShareZoom()
  const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
  const announce = useScreenReaderAnnounce()
  const popoutChromeRef = useRef<HTMLDivElement>(null)
  const popoutButtonRef = useRef<HTMLButtonElement>(null)
  const wasPoppedOut = useRef(false)

  const participantName =
    trackRef.participant.name || trackRef.participant.identity || 'Unknown'
  const windowName = `meet-screen-share-${trackRef.publication.trackSid || trackRef.participant.identity}`

  const getVideoElement = useCallback(
    () => zoom.transformElRef.current?.querySelector('video') ?? null,
    [zoom.transformElRef]
  )

  const popout = useScreenSharePopout({
    windowName,
    title: t('separateWindowTitle', { name: participantName }),
    getVideoElement,
  })

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

  // Keys on the tile, or on the popup once the video is over there.
  useEffect(() => {
    const el = popout.isOpen ? popoutChromeRef.current : tileRef.current
    if (!el) return
    el.addEventListener('keydown', zoom.handleKeyDown)
    return () => el.removeEventListener('keydown', zoom.handleKeyDown)
  }, [popout.isOpen, tileRef, zoom.handleKeyDown])

  // Native wheel listener with { passive: false } so preventDefault works.
  // Re-attach when the video moves to the other window.
  useEffect(() => {
    const el = zoom.surfaceElRef.current
    if (!el) return
    el.addEventListener('wheel', zoom.handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', zoom.handleWheel)
  }, [zoom.handleWheel, zoom.surfaceElRef, popout.isOpen])

  // Open: focus the popup. Close: focus the button again (the toolbar remounts).
  const { resync } = zoom
  useLayoutEffect(() => {
    resync()
    if (popout.isOpen) {
      wasPoppedOut.current = true
      popoutChromeRef.current?.focus()
      return
    }
    if (!wasPoppedOut.current) return
    wasPoppedOut.current = false
    popoutButtonRef.current?.focus()
  }, [popout.isOpen, resync])

  const media = (
    <>
      <div
        ref={zoom.surfaceElRef}
        className={css({
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          position: 'relative',
          userSelect: 'none',
          // Leaves the browser's native pinch-zoom available on touch devices
          // while still routing single-pointer drags to useMove for panning.
          touchAction: 'pinch-zoom',
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
          {/* LiveKit unsubscribes tiles it believes are off-screen. Its
              observer cannot measure an element living in another window and
              reads it as hidden, which would drop the track a few seconds
              after opening, unpin the share and tear this tile down. */}
          <ScreenShareVideoTrack
            trackRef={trackRef}
            onSubscriptionStatusChanged={onSubscriptionStatusChanged}
            manageSubscription={manageSubscription && !popout.isOpen}
          />
        </div>
      </div>
      <ScreenShareZoomControls
        containerRef={popout.isOpen ? popoutChromeRef : tileRef}
        isZoomed={zoom.isZoomed}
        zoomPercentage={zoom.zoomPercentage}
        canZoomIn={zoom.canZoomIn}
        canZoomOut={zoom.canZoomOut}
        isPoppedOut={popout.isOpen}
        popoutButtonRef={popoutButtonRef}
        onZoomIn={zoom.zoomIn}
        onZoomOut={zoom.zoomOut}
        onResetZoom={zoom.resetZoom}
        onTogglePopout={popout.toggle}
      />
    </>
  )

  // Video in the popup, placeholder in the meeting so the layout stays put.
  if (popout.isOpen && popout.container) {
    return (
      <>
        <ScreenSharePopoutPlaceholder onReturn={popout.close} />
        <ScreenSharePopoutPortal container={popout.container}>
          <div
            ref={popoutChromeRef}
            role="group"
            // Focusable on purpose: it carries the zoom key handler, and the
            // popup body is an ancestor, so keys would never bubble to it.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label={t('separateWindowLabel', { name: participantName })}
            className={popoutChromeClassName}
          >
            {media}
          </div>
        </ScreenSharePopoutPortal>
      </>
    )
  }

  return media
}
