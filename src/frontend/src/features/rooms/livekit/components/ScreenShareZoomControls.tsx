import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { Button } from '@/primitives'
import {
  RiCollapseDiagonalLine,
  RiExpandDiagonalLine,
  RiFullscreenExitLine,
  RiZoomInLine,
  RiZoomOutLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'

interface ScreenShareZoomControlsProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  isZoomed: boolean
  zoomPercentage: number
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  onResetZoom: () => void
}

export const ScreenShareZoomControls = ({
  containerRef,
  isZoomed,
  zoomPercentage,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: ScreenShareZoomControlsProps) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
  const announce = useScreenReaderAnnounce()

  const [isFullscreen, setIsFullscreen] = useState(false)
  // Tracks whether this tile's container triggered fullscreen (vs another share's).
  const wasThisTileFullscreen = useRef(false)
  const [isFullscreenAvailable] = useState(
    () => typeof document !== 'undefined' && document.fullscreenEnabled
  )

  // Covers Esc and browser UI exits, not just the toolbar button.
  // Only this tile's instance announces to avoid duplicates with multiple shares.
  useEffect(() => {
    const onChange = () => {
      const isThisTileFullscreen =
        document.fullscreenElement === containerRef.current
      setIsFullscreen(isThisTileFullscreen)

      if (isThisTileFullscreen) {
        wasThisTileFullscreen.current = true
        announce(t('fullScreenEntered'), 'assertive')
      } else if (wasThisTileFullscreen.current) {
        wasThisTileFullscreen.current = false
        announce(t('fullScreenExited'), 'assertive')
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [announce, t, containerRef])

  const toggleFullScreen = useCallback(async () => {
    try {
      if (document.fullscreenElement === containerRef.current) {
        await document.exitFullscreen()
      } else {
        // Tile container so zoom controls stay visible in fullscreen.
        await containerRef.current?.requestFullscreen()
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error)
    }
  }, [containerRef])

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
      <HStack
        gap={0}
        role="toolbar"
        aria-label={t('toolbarLabel')}
        className={css({
          backgroundColor: 'primaryDark.50',
          borderRadius: '2rem',
          padding: '0.5rem',
          alignItems: 'center',
          overflow: 'hidden',
          opacity: 0.7,
          transition: 'opacity 200ms linear',
          _hover: {
            opacity: 0.95,
          },
        })}
      >
        {isZoomed && (
          <>
            <Button
              size="sm"
              variant="primaryTextDark"
              square
              tooltip={t('fitToWindow')}
              aria-label={t('fitToWindow')}
              onPress={onResetZoom}
            >
              <RiFullscreenExitLine size={20} />
            </Button>
            <Button
              size="sm"
              variant="primaryTextDark"
              square
              tooltip={t('zoomOut')}
              aria-label={t('zoomOut')}
              isDisabled={!canZoomOut}
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
              })}
            >
              {zoomPercentage} %
            </span>
          </>
        )}
        <Button
          size="sm"
          variant="primaryTextDark"
          square
          tooltip={t('zoomIn')}
          aria-label={t('zoomIn')}
          isDisabled={!canZoomIn}
          onPress={onZoomIn}
        >
          <RiZoomInLine size={20} />
        </Button>
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
      </HStack>
    </div>
  )
}
