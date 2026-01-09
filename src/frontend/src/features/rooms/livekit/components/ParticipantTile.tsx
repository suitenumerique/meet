import {
  AudioTrack,
  ConnectionQualityIndicator,
  LockLockedIcon,
  ParticipantTileProps,
  ScreenShareIcon,
  useEnsureTrackRef,
  useFeatureContext,
  useIsEncrypted,
  useMaybeLayoutContext,
  useMaybeTrackRefContext,
  useParticipantTile,
  VideoTrack,
  TrackRefContext,
  ParticipantContextIfNeeded,
} from '@livekit/components-react'
import React from 'react'
import {
  isTrackReference,
  isTrackReferencePinned,
  TrackReferenceOrPlaceholder,
} from '@livekit/components-core'
import { Track } from 'livekit-client'
import { RiHand } from '@remixicon/react'
import { useRaisedHand, useRaisedHandPosition } from '../hooks/useRaisedHand'
import { HStack } from '@/styled-system/jsx'
import { MutedMicIndicator } from './MutedMicIndicator'
import { ParticipantPlaceholder } from './ParticipantPlaceholder'
import { ParticipantTileFocus } from './ParticipantTileFocus'
import { FullScreenShareWarning } from './FullScreenShareWarning'
import { ParticipantName } from './ParticipantName'
import { getParticipantName } from '@/features/rooms/utils/getParticipantName'
import { useTranslation } from 'react-i18next'
import { ShortcutHelpTooltip } from './ShortcutHelpTooltip'

export function TrackRefContextIfNeeded(
  props: React.PropsWithChildren<{
    trackRef?: TrackReferenceOrPlaceholder
  }>
) {
  const hasContext = !!useMaybeTrackRefContext()
  return props.trackRef && !hasContext ? (
    <TrackRefContext.Provider value={props.trackRef}>
      {props.children}
    </TrackRefContext.Provider>
  ) : (
    <>{props.children}</>
  )
}

interface ParticipantTileExtendedProps extends ParticipantTileProps {
  disableMetadata?: boolean
}

export const ParticipantTile: (
  props: ParticipantTileExtendedProps & React.RefAttributes<HTMLDivElement>
) => React.ReactNode = /* @__PURE__ */ React.forwardRef<
  HTMLDivElement,
  ParticipantTileExtendedProps
>(function ParticipantTile(
  {
    trackRef,
    children,
    onParticipantClick,
    disableSpeakingIndicator,
    disableMetadata,
    ...htmlProps
  }: ParticipantTileExtendedProps,
  ref
) {
  const trackReference = useEnsureTrackRef(trackRef)

  const { elementProps } = useParticipantTile<HTMLDivElement>({
    htmlProps,
    disableSpeakingIndicator,
    onParticipantClick,
    trackRef: trackReference,
  })
  const isEncrypted = useIsEncrypted(trackReference.participant)
  const layoutContext = useMaybeLayoutContext()

  const autoManageSubscription = useFeatureContext()?.autoSubscription

  const handleSubscribe = React.useCallback(
    (subscribed: boolean) => {
      if (
        trackReference.source &&
        !subscribed &&
        layoutContext &&
        layoutContext.pin.dispatch &&
        isTrackReferencePinned(trackReference, layoutContext.pin.state)
      ) {
        layoutContext.pin.dispatch({ msg: 'clear_pin' })
      }
    },
    [trackReference, layoutContext]
  )

  const { isHandRaised } = useRaisedHand({
    participant: trackReference.participant,
  })

  const { positionInQueue, firstInQueue } = useRaisedHandPosition({
    participant: trackReference.participant,
  })

  const isScreenShare = trackReference.source != Track.Source.Camera
  const [hasKeyboardFocus, setHasKeyboardFocus] = React.useState(false)

  const participantName = getParticipantName(trackReference.participant)
  const { t } = useTranslation('rooms', { keyPrefix: 'participantTileFocus' })

  const interactiveProps = {
    ...elementProps,
    // Ensure the tile is focusable to expose contextual controls to keyboard users.
    tabIndex: 0,
    'aria-label': t('containerLabel', { name: participantName }),
    onFocus: (event: React.FocusEvent<HTMLDivElement>) => {
      elementProps.onFocus?.(event)
      const target = event.target as HTMLElement | null
      const isFocusVisible = !!target?.matches?.(':focus-visible')
      setHasKeyboardFocus(isFocusVisible)
    },
    onBlur: (event: React.FocusEvent<HTMLDivElement>) => {
      elementProps.onBlur?.(event)
      const nextTarget = event.relatedTarget as Node | null
      if (!event.currentTarget.contains(nextTarget)) {
        setHasKeyboardFocus(false)
      }
    },
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} {...interactiveProps}>
      <TrackRefContextIfNeeded trackRef={trackReference}>
        <ParticipantContextIfNeeded participant={trackReference.participant}>
          <FullScreenShareWarning trackReference={trackReference} />
          {children ?? (
            <>
              {isTrackReference(trackReference) &&
              (trackReference.publication?.kind === 'video' ||
                trackReference.source === Track.Source.Camera ||
                trackReference.source === Track.Source.ScreenShare) ? (
                <VideoTrack
                  trackRef={trackReference}
                  onSubscriptionStatusChanged={handleSubscribe}
                  manageSubscription={autoManageSubscription}
                />
              ) : (
                isTrackReference(trackReference) && (
                  <AudioTrack
                    trackRef={trackReference}
                    onSubscriptionStatusChanged={handleSubscribe}
                  />
                )
              )}
              <div className="lk-participant-placeholder">
                <ParticipantPlaceholder
                  participant={trackReference.participant}
                />
              </div>
              {!disableMetadata && (
                <div className="lk-participant-metadata">
                  <HStack gap={0.25}>
                    {!isScreenShare && (
                      <MutedMicIndicator
                        participant={trackReference.participant}
                      />
                    )}
                    <div
                      className="lk-participant-metadata-item"
                      style={{
                        padding: '0.1rem 0.25rem',
                        backgroundColor:
                          isHandRaised && !isScreenShare
                            ? firstInQueue
                              ? '#fde047'
                              : 'white'
                            : undefined,
                        color:
                          isHandRaised && !isScreenShare ? 'black' : undefined,
                        transition: 'background 200ms ease, color 400ms ease',
                      }}
                    >
                      {isHandRaised && !isScreenShare && (
                        <>
                          <span>{positionInQueue}</span>
                          <RiHand
                            color="black"
                            size={16}
                            style={{
                              marginRight: '0.4rem',
                              marginLeft: '0.1rem',
                              minWidth: '16px',
                              animationDuration: '300ms',
                              animationName: 'wave_hand',
                              animationIterationCount: '2',
                            }}
                          />
                        </>
                      )}
                      {isScreenShare && (
                        <ScreenShareIcon
                          style={{
                            maxWidth: '20px',
                            width: '100%',
                          }}
                        />
                      )}
                      {isEncrypted && !isScreenShare && (
                        <LockLockedIcon style={{ marginRight: '0.25rem' }} />
                      )}
                      <ParticipantName
                        isScreenShare={isScreenShare}
                        participant={trackReference.participant}
                      />
                    </div>
                  </HStack>
                  <ConnectionQualityIndicator className="lk-participant-metadata-item" />
                </div>
              )}
            </>
          )}
          {!disableMetadata && (
            <ParticipantTileFocus
              trackRef={trackReference}
              hasKeyboardFocus={hasKeyboardFocus}
            />
          )}
        </ParticipantContextIfNeeded>
      </TrackRefContextIfNeeded>
      <ShortcutHelpTooltip
        triggerLabel={t('toolbarHint')}
        isVisible={hasKeyboardFocus}
      />
    </div>
  )
})
