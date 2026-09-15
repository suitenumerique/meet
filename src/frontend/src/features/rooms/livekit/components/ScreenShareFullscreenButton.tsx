import { Button } from '@/primitives'
import { RiCollapseDiagonalLine, RiExpandDiagonalLine } from '@remixicon/react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScreenReaderAnnounce } from '@/hooks/useScreenReaderAnnounce'

const getOwnerDocument = (el: Element | null) => el?.ownerDocument ?? document

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
    const [isFullscreenAvailable, setIsFullscreenAvailable] = useState(
      () => document.fullscreenEnabled
    )
    // Tracks whether this tile's container triggered fullscreen (vs another share's).
    const wasThisTileFullscreen = useRef(false)

    // Covers Esc and browser UI exits, not just this button.
    // Listens on the element's own document, so it still works in the popup.
    // Only this tile's instance announces to avoid duplicates with multiple shares.
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
    }, [announce, t, containerRef])

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

    if (!isFullscreenAvailable) return null

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
