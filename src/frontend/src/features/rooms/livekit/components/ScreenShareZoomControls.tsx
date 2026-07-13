import { css } from '@/styled-system/css'
import { HStack } from '@/styled-system/jsx'
import { Button } from '@/primitives'
import {
  RiFullscreenExitLine,
  RiZoomInLine,
  RiZoomOutLine,
} from '@remixicon/react'
import { useTranslation } from 'react-i18next'
import { ScreenShareFullscreenButton } from './ScreenShareFullscreenButton'

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
          padding: '0.25rem',
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
              <RiFullscreenExitLine size={18} />
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
              <RiZoomOutLine size={18} />
            </Button>
            {/* Visual only - zoom level is announced via useScreenReaderAnnounce. */}
            <span
              aria-hidden="true"
              className={css({
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: 500,
                minWidth: '3rem',
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
          <RiZoomInLine size={18} />
        </Button>
        <ScreenShareFullscreenButton containerRef={containerRef} />
      </HStack>
    </div>
  )
}
