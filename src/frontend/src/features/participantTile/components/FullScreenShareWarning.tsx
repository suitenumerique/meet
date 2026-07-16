import { css } from '@/styled-system/css'
import { Button, Text } from '@/primitives'
import { useCallback, useMemo, useRef } from 'react'
import { screenSharePreferenceStore } from '@/stores/screenSharePreferences'
import { useSnapshot } from 'valtio'
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core'
import { useTranslation } from 'react-i18next'
import { useSize } from '@/features/rooms/livekit/hooks/useResizeObserver'
import { LocalParticipant } from 'livekit-client'

export const FullScreenShareWarning = ({
  trackReference,
}: {
  trackReference: TrackReferenceOrPlaceholder
}) => {
  const { t } = useTranslation('rooms', { keyPrefix: 'fullScreenWarning' })

  const warningContainerRef = useRef<HTMLDivElement>(null)
  const { width: containerWidth } = useSize(warningContainerRef)
  const screenSharePreferences = useSnapshot(screenSharePreferenceStore)

  const isFullScreenSharing = useMemo(() => {
    if (trackReference?.source !== 'screen_share') return false

    const mediaStreamTrack = trackReference.publication?.track?.mediaStreamTrack

    if (!mediaStreamTrack) return false

    // Method 1: Display Surface Check (Chrome & Edge)
    const trackSettings = mediaStreamTrack.getSettings()
    if (trackSettings?.displaySurface) {
      return trackSettings.displaySurface === 'monitor'
    }

    // Method 2: Track Constraints Check
    const constraints = mediaStreamTrack.getConstraints()
    if (constraints?.displaySurface) {
      return constraints.displaySurface === 'monitor'
    }

    // Method 3: Label Analysis (Firefox, Safari)
    const trackLabel = mediaStreamTrack.label.toLowerCase()
    const fullScreenIndicators = [
      'monitor',
      'screen',
      'display',
      'entire screen',
      'full screen',
    ]
    return fullScreenIndicators.some((indicator) =>
      trackLabel.includes(indicator)
    )
  }, [trackReference])

  const shouldShowWarning =
    screenSharePreferences.enabled && isFullScreenSharing

  const handleStopScreenShare = async () => {
    const participant = trackReference.participant
    if (!(participant instanceof LocalParticipant)) return
    if (!participant.isScreenShareEnabled) return
    await (participant as LocalParticipant).setScreenShareEnabled(false, {}, {})
  }

  const handleDismissWarning = useCallback(() => {
    screenSharePreferenceStore.enabled = false
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleDismissWarning()
      }
    },
    [handleDismissWarning]
  )

  if (!shouldShowWarning) return null

  return (
    <div
      className={css({
        position: 'absolute',
        height: '100%',
        width: '100%',
      })}
      ref={warningContainerRef}
    >
      {(!containerWidth || containerWidth >= 300) && (
        <div
          className={css({
            position: 'absolute',
            height: '100%',
            width: '100%',
            backgroundColor: 'rgba(22, 22, 34, 0.9)',
            padding: '2rem',
          })}
        >
          <div
            className={css({
              display: 'flex',
              justifyContent: 'space-between',
              flexDirection: 'column',
              gap: '1rem',
              md: {
                flexDirection: 'row',
              },
            })}
          >
            <Text
              role="alert"
              style={{
                color: 'white',
                flexBasis: '55%',
                fontWeight: '500',
              }}
              margin={false}
              wrap={'pretty'}
            >
              {t('message')}
            </Text>
            <div
              className={css({
                display: 'flex',
                flexDirection: 'row',
                gap: '1rem',
                zIndex: '1000',
              })}
            >
              <Button
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                variant="tertiary"
                size="sm"
                style={{
                  height: 'fit-content',
                }}
                onKeyDown={handleKeyDown}
                onPress={async () => {
                  await handleStopScreenShare()
                }}
              >
                {t('stop')}
              </Button>
              <Button
                variant="primaryTextDark"
                size="sm"
                style={{
                  height: 'fit-content',
                }}
                onKeyDown={handleKeyDown}
                onPress={() => handleDismissWarning()}
              >
                {t('ignore')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
