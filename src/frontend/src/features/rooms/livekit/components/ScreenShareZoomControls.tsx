import { css } from '@/styled-system/css'
import { Button } from '@/primitives'
import {
  RiCollapseDiagonalLine,
  RiExpandDiagonalLine,
  RiFullscreenExitLine,
  RiArrowGoBackLine,
  RiShareBoxLine,
  RiZoomInLine,
  RiZoomOutLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from 'react-aria-components'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'
import { isMacintosh } from '@/utils/livekit'
import { srOnly } from '@/styles/a11y'
import { useIsMobile } from '@/utils/useIsMobile'

interface ScreenShareZoomControlsProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  isZoomed: boolean
  zoomPercentage: number
  canZoomIn: boolean
  canZoomOut: boolean
  isPoppedOut: boolean
  popoutButtonRef: React.Ref<HTMLButtonElement>
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
  onTogglePopout: () => void
}

const getOwnerDocument = (el: Element | null) => el?.ownerDocument ?? document

export const ScreenShareZoomControls = ({
  containerRef,
  isZoomed,
  zoomPercentage,
  canZoomIn,
  canZoomOut,
  isPoppedOut,
  popoutButtonRef,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onTogglePopout,
}: ScreenShareZoomControlsProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
  const announce = useScreenReaderAnnounce()
  const isMobile = useIsMobile()

  const zoomInButtonRef = useRef<HTMLButtonElement>(null)
  const hadFocusInCollapsibleRef = useRef(false)

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isFullscreenAvailable, setIsFullscreenAvailable] = useState(
    () => document.fullscreenEnabled
  )
  // Tracks whether this tile's container triggered fullscreen (vs another share's).
  const wasThisTileFullscreen = useRef(false)

  // Covers Esc and browser UI exits, not just the toolbar button.
  // Listen on the popup document too, so fullscreen still works there.
  useEffect(() => {
    const doc = getOwnerDocument(containerRef.current)
    setIsFullscreenAvailable(!!doc.fullscreenEnabled)

    const onChange = () => {
      const isThisTileFullscreen =
        doc.fullscreenElement === containerRef.current
      setIsFullscreen(isThisTileFullscreen)

      if (isThisTileFullscreen) {
        wasThisTileFullscreen.current = true
        announce(t('fullScreenEntered'), 'assertive')
      } else if (wasThisTileFullscreen.current) {
        wasThisTileFullscreen.current = false
        announce(t('fullScreenExited'), 'assertive')
      }
    }
    doc.addEventListener('fullscreenchange', onChange)
    return () => doc.removeEventListener('fullscreenchange', onChange)
  }, [announce, t, containerRef, isPoppedOut])

  // Back at 100 % the collapsible controls are disabled and hidden, which drops
  // keyboard focus on the body. Hand it to the zoom in button instead, the only
  // control of that group still reachable.
  useEffect(() => {
    if (isZoomed || !hadFocusInCollapsibleRef.current) return
    hadFocusInCollapsibleRef.current = false
    zoomInButtonRef.current?.focus()
  }, [isZoomed])

  const toggleFullScreen = useCallback(async () => {
    const doc = getOwnerDocument(containerRef.current)
    try {
      if (doc.fullscreenElement === containerRef.current) {
        await doc.exitFullscreen()
      } else {
        // Tile / pop-out chrome so zoom controls stay visible in fullscreen.
        await containerRef.current?.requestFullscreen()
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error)
    }
  }, [containerRef])

  const wheelShortcut = t(isMacintosh() ? 'wheelShortcutMac' : 'wheelShortcut')

  return (
    <div
      className={css({
        position: 'absolute',
        bottom: '12px',
        right: '12px',
        zIndex: 2,
        pointerEvents: 'auto',
      })}
    >
      {/* react-aria Toolbar: left/right arrows move between the controls and
          Tab leaves the group as a whole, as the toolbar role implies. */}
      <Toolbar
        aria-label={t('toolbarLabel')}
        className={css({
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'primaryDark.50',
          borderRadius: '2rem',
          padding: '0.5rem',
          opacity: 0.7,
          transition: 'opacity 200ms linear',
          _hover: {
            opacity: 0.95,
          },
        })}
      >
        <span className={srOnly}>
          {t(isMacintosh() ? 'wheelShortcutHintMac' : 'wheelShortcutHint')}
        </span>
        {/* Animated wrapper: collapses to 0 when not zoomed. padding/margin
            trick keeps overflow:hidden from clipping focus rings. */}
        <div
          className={css({
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            transition: 'max-width 200ms ease-out, opacity 200ms ease-out',
            padding: '3px',
            margin: '-3px',
          })}
          style={{
            maxWidth: isZoomed ? '12rem' : '0',
            opacity: isZoomed ? 1 : 0,
          }}
          aria-hidden={!isZoomed}
          onFocus={() => {
            hadFocusInCollapsibleRef.current = true
          }}
          onBlur={(e) => {
            // Disabling a focused button blurs it with no relatedTarget, so the
            // flag must survive that case for the effect above to rescue focus.
            if (e.relatedTarget) hadFocusInCollapsibleRef.current = false
          }}
        >
          <Button
            size="sm"
            variant="primaryTextDark"
            square
            tooltip={t('fitToWindow')}
            aria-label={t('fitToWindow')}
            isDisabled={!isZoomed}
            onPress={onResetZoom}
          >
            <RiFullscreenExitLine size={20} />
          </Button>
          <Button
            size="sm"
            variant="primaryTextDark"
            square
            tooltip={t('zoomOutWithShortcut', {
              shortcut: wheelShortcut,
            })}
            aria-label={t('zoomOut')}
            isDisabled={!isZoomed || !canZoomOut}
            onPress={onZoomOut}
          >
            <RiZoomOutLine size={20} />
          </Button>
          {/* Visual only - zoom level is announced via useScreenReaderAnnounce. */}
          <span
            aria-hidden="true"
            className={css({
              color: 'white',
              fontSize: '0.8125rem',
              fontWeight: 500,
              minWidth: '3.25rem',
              textAlign: 'center',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 0.25rem',
              whiteSpace: 'nowrap',
            })}
          >
            {zoomPercentage} %
          </span>
        </div>
        <Button
          ref={zoomInButtonRef}
          size="sm"
          variant="primaryTextDark"
          square
          tooltip={t('zoomInWithShortcut', { shortcut: wheelShortcut })}
          aria-label={t('zoomIn')}
          isDisabled={!canZoomIn}
          onPress={onZoomIn}
        >
          <RiZoomInLine size={20} />
        </Button>
        {/* Desktop only — popups on mobile are usually blocked. */}
        {!isMobile && (
          <Button
            ref={popoutButtonRef}
            size="sm"
            variant="primaryTextDark"
            square
            tooltip={
              isPoppedOut ? t('closeSeparateWindow') : t('openInSeparateWindow')
            }
            aria-label={
              isPoppedOut ? t('closeSeparateWindow') : t('openInSeparateWindow')
            }
            onPress={onTogglePopout}
          >
            {isPoppedOut ? (
              <RiArrowGoBackLine size={20} />
            ) : (
              <RiShareBoxLine size={20} />
            )}
          </Button>
        )}
        {isFullscreenAvailable && (
          <Button
            size="sm"
            variant="primaryTextDark"
            square
            tooltip={isFullscreen ? t('exitFullScreen') : t('fullScreen')}
            aria-label={isFullscreen ? t('exitFullScreen') : t('fullScreen')}
            onPress={toggleFullScreen}
          >
            {isFullscreen ? (
              <RiCollapseDiagonalLine size={20} />
            ) : (
              <RiExpandDiagonalLine size={20} />
            )}
          </Button>
        )}
      </Toolbar>
    </div>
  )
}
