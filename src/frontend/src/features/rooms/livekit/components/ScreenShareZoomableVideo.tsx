import { css } from '@/styled-system/css'
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenShareZoom } from '../hooks/useScreenShareZoom'
import { useScreenSharePopout } from '../hooks/useScreenSharePopout'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { ScreenShareZoomControls } from './ScreenShareZoomControls'
import { ScreenSharePopoutPortal } from './ScreenSharePopoutPortal'
import {
  saveScreenShareZoom,
  takePopoutButtonFocus,
  takeScreenShareZoom,
} from '@/stores/screenSharePopout'

interface ScreenShareZoomableVideoProps {
  tileRef: React.RefObject<HTMLDivElement | null>
  participantName: string
  trackSid: string
  windowName: string
  children: ReactNode
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
  tileRef,
  participantName,
  trackSid,
  windowName,
  children,
}: ScreenShareZoomableVideoProps) => {
  const zoom = useScreenShareZoom()
  const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
  const announce = useScreenReaderAnnounce()
  const popoutChromeRef = useRef<HTMLDivElement>(null)
  const popoutButtonRef = useRef<HTMLButtonElement>(null)
  const wasPoppedOut = useRef(false)

  const getVideoElement = useCallback(
    () => zoom.transformElRef.current?.querySelector('video') ?? null,
    [zoom.transformElRef]
  )

  const popout = useScreenSharePopout({
    trackSid,
    windowName,
    title: t('separateWindowTitle', { name: participantName }),
    getVideoElement,
  })

  // Moving the video in or out of the window remounts this tile, because the
  // stage pin changes. Stash the zoom so the new instance picks it up.
  const { capture, resync } = zoom
  useLayoutEffect(() => {
    return () => saveScreenShareZoom(trackSid, capture())
  }, [trackSid, capture])

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
  useLayoutEffect(() => {
    resync(takeScreenShareZoom(trackSid) ?? undefined)
    if (popout.isOpen) {
      wasPoppedOut.current = true
      popoutChromeRef.current?.focus()
      return
    }
    if (!wasPoppedOut.current && !takePopoutButtonFocus(trackSid)) return
    wasPoppedOut.current = false
    popoutButtonRef.current?.focus()
  }, [popout.isOpen, resync, trackSid])

  // LiveKit unsubscribes tiles it believes are off-screen. Its observer
  // cannot measure an element living in another window and reads it as
  // hidden, which would drop the track a few seconds after opening.
  const video =
    popout.isOpen && isValidElement<{ manageSubscription?: boolean }>(children)
      ? cloneElement(children, { manageSubscription: false })
      : children

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
          {video}
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

  // Video in the popup. The meeting layout does not keep a tile for it.
  if (popout.isOpen && popout.container) {
    return (
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
    )
  }

  return media
}
