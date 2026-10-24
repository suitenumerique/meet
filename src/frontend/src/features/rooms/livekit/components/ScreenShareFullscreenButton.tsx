import { Button } from '@/primitives'
import { RiCollapseDiagonalLine, RiExpandDiagonalLine } from '@remixicon/react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'

// Keeps the fullscreen state here rather than on the toolbar, so entering or
// leaving fullscreen does not re-render the zoom controls.
export const ScreenShareFullscreenButton = memo(
  ({
    containerRef,
  }: {
    containerRef: React.RefObject<HTMLDivElement | null>
  }) => {
    const { t } = useTranslation('rooms', { keyPrefix: 'screenShareZoom' })
    const announce = useScreenReaderAnnounce()

    const [isFullscreen, setIsFullscreen] = useState(false)
    // Tracks whether this tile's container triggered fullscreen (vs another share's).
    const wasThisTileFullscreen = useRef(false)

    // Covers Esc and browser UI exits, not just this button.
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

    if (!document.fullscreenEnabled) return null

    return (
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
    )
  }
)

ScreenShareFullscreenButton.displayName = 'ScreenShareFullscreenButton'
